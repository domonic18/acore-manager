import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { toast } from '@/shared/utils/toast.util';
import { feishuAuthApi } from '../api/feishu-auth.api';

// 飞书工作台免登：动态加载 h5sdk，requestAccess 取一次性 code（需客户端 V6.9.0+），
// 8s 静默回退 requestAuthCode，20s 超时兜底；code 交后端换取 JWT。appId 用 ref 传递避免闭包过期。
const H5SDK_URL = 'https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.26.js';

interface AuthCodeResult {
  errno?: number;
  errCode?: number;
  errMsg?: string;
  code?: string;
}

interface JsapiFn {
  (opts: Record<string, unknown>): void;
}

interface H5SdkWindow {
  __JSSDK_VERSION__?: { SDKVersion?: string; SDKCDNVersion?: string };
  h5sdk?: {
    ready: (fn: () => void) => void;
    requestAccess?: JsapiFn;
    requestAuthCode?: JsapiFn;
  };
  tt?: {
    requestAccess?: JsapiFn;
    requestAuthCode?: JsapiFn;
  };
}

declare global {
  interface Window {
    tt?: H5SdkWindow['tt'];
    h5sdk?: H5SdkWindow['h5sdk'];
  }
}

let sdkLoadPromise: Promise<H5SdkWindow> | null = null;

function loadH5Sdk(): Promise<H5SdkWindow> {
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    const w = window as H5SdkWindow;
    if (w.h5sdk || w.tt) {
      resolve(w);
      return;
    }
    const script = document.createElement('script');
    script.src = H5SDK_URL;
    script.onload = () => resolve(window as H5SdkWindow);
    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error('飞书 JSSDK 加载失败 / failed to load feishu jsapi'));
    };
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

function requestAuthCode(w: H5SdkWindow, appId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let readyFired = false;
    let settled = false;
    let branch = '-';

    // 诊断串进错误消息：免登静默失败时无需远程调试即可定位卡点
    // （bridge setup 未完成=ready=0；旧客户端原生层不识别 requestAccess=access 静默）
    const diag = () => {
      const v = w.__JSSDK_VERSION__;
      return [
        `sdk=${v?.SDKVersion ?? '?'}/${v?.SDKCDNVersion ?? '?'}`,
        `h5sdk=${w.h5sdk ? 1 : 0}`,
        `tt=${w.tt ? 1 : 0}`,
        `access=${typeof (w.tt?.requestAccess ?? w.h5sdk?.requestAccess)}`,
        `authcode=${typeof (w.tt?.requestAuthCode ?? w.h5sdk?.requestAuthCode)}`,
        `ready=${readyFired ? 1 : 0}`,
        `branch=${branch}`,
        `appIdLen=${appId.length}`,
      ].join(' ');
    };

    const finish = (r: AuthCodeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(mainTimer);
      if (r && r.code) {
        resolve(r.code);
        return;
      }
      reject(new Error(`飞书授权失败（errno=${r?.errno ?? '?'} errCode=${r?.errCode ?? '?'} ${r?.errMsg ?? ''}）[${diag()}] / feishu auth failed`));
    };

    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(mainTimer);
      reject(new Error(`${msg} [${diag()}]`));
    };

    // 超时兜底：SDK 无响应（bridge 未就绪/客户端过旧/弹层被拦）时不再无限挂起，回落密码登录
    const mainTimer = setTimeout(() => fail('飞书授权超时，请重试或使用密码登录 / feishu auth timeout'), 20_000);

    const guarded = (invoke: () => void, fnName: string): boolean => {
      try {
        invoke();
        return true;
      } catch (err) {
        fail(`飞书免登调用异常 ${fnName}: ${err instanceof Error ? err.message : String(err)}`);
        return true;
      }
    };

    const callAuthCode = () => {
      const fn = w.tt?.requestAuthCode ?? w.h5sdk?.requestAuthCode;
      if (typeof fn !== 'function') return false;
      branch = 'authcode';
      return guarded(() => fn({ appId, success: finish, fail: finish }), 'requestAuthCode');
    };

    const callAccess = () => {
      const fn = w.tt?.requestAccess ?? w.h5sdk?.requestAccess;
      if (typeof fn !== 'function') return false;
      branch = 'access';
      return guarded(() => fn({ appID: appId, scopeList: [], state: '', success: finish, fail: finish }), 'requestAccess');
    };

    // 免登授权须在 h5sdk.ready 后调用；requestAccess 需客户端 V6.9.0+，
    // 旧客户端原生层不识别该方法且静默丢弃 → 8s 无响应回退 requestAuthCode
    w.h5sdk?.ready(() => {
      readyFired = true;
      if (settled) return;
      if (callAccess()) {
        setTimeout(() => {
          if (!settled && branch === 'access') callAuthCode();
        }, 8_000);
        return;
      }
      if (!callAuthCode()) fail('当前环境不支持飞书免登 / feishu jsapi unavailable');
    });
  });
}

type LoginPhase = 'checking' | 'password' | 'authenticating';

export function useFeishuLogin() {
  const { login } = useAuth();
  const [phase, setPhase] = useState<LoginPhase>('checking');
  const appIdRef = useRef('');

  const authenticate = useCallback(async () => {
    setPhase('authenticating');
    try {
      const code = await requestAuthCode(await loadH5Sdk(), appIdRef.current);
      const result = await feishuAuthApi.login(code);
      login(result.token, result.user);
      toast.success('飞书登录成功');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '飞书登录失败 / feishu login failed');
      // 免登失败（未绑定/环境不支持）回落密码登录
      setPhase('password');
    }
  }, [login]);

  const checkStatus = useCallback(async () => {
    try {
      const status = await feishuAuthApi.getStatus();
      if (status.enabled) {
        appIdRef.current = status.appId;
        await authenticate();
        return;
      }
    } catch {
      // 状态探测失败视同免登关闭
    }
    setPhase('password');
  }, [authenticate]);

  const startAuthentication = useCallback(() => {
    void authenticate();
  }, [authenticate]);

  return { phase, checkStatus, startAuthentication };
}

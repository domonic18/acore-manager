import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { toast } from '@/shared/utils/toast.util';
import { feishuAuthApi } from '../api/feishu-auth.api';

// 飞书工作台免登：动态加载 h5sdk，requestAccess 取一次性 code（新客户端），
// 客户端过旧回退 requestAuthCode；code 交后端换取 JWT。appId 用 ref 传递避免闭包过期。
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
    // 飞书 JSAPI 标准对象约定：success/fail 是 opts 内的回调属性，而非第二位置参数；
    // 传错位置（旧实现）会被 SDK 静默忽略，表现为"正在通过飞书登录"无限挂起
    const finish = (timer: ReturnType<typeof setTimeout>) => (r: AuthCodeResult) => {
      clearTimeout(timer);
      if (r && r.code) {
        resolve(r.code);
        return;
      }
      reject(new Error(`飞书授权失败（errno=${r?.errno ?? '?'} errCode=${r?.errCode ?? '?'} ${r?.errMsg ?? ''}）/ feishu auth failed`));
    };

    // 超时兜底：SDK 无响应（如客户端版本过旧/弹层被拦）时不再无限挂起，回落密码登录
    const timer = setTimeout(
      () => reject(new Error('飞书授权超时，请重试或使用密码登录 / feishu auth timeout')),
      20_000,
    );
    const onCode = finish(timer);

    // 免登授权须在 h5sdk.ready 后调用；官方示例经 tt.* 调用，缺 requestAccess（旧客户端）回退 requestAuthCode
    w.h5sdk?.ready(() => {
      const requestAccess = w.tt?.requestAccess ?? w.h5sdk?.requestAccess;
      const requestAuthCodeFn = w.tt?.requestAuthCode ?? w.h5sdk?.requestAuthCode;
      if (typeof requestAccess === 'function') {
        requestAccess({ appID: appId, scopeList: [], state: '', success: onCode, fail: onCode });
      } else if (typeof requestAuthCodeFn === 'function') {
        requestAuthCodeFn({ appId, success: onCode, fail: onCode });
      } else {
        clearTimeout(timer);
        reject(new Error('当前环境不支持飞书免登 / feishu jsapi unavailable'));
      }
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

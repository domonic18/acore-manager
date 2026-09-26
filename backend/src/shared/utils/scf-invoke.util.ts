import { createHash, createHmac } from 'node:crypto';

// TC3-HMAC-SHA256 自签名 SCF Invoke 客户端（参考 SquadSight invoke_client.py 生产验证实现，
// 避免 tencentcloud-sdk 依赖）。ClientContext 为事件 JSON 字符串（Job 事件契约见 job/job-entry.ts）。

export class ScfInvokeError extends Error {
  constructor(
    message: string,
    public code: string = 'InvokeFailed',
  ) {
    super(message);
  }
}

const SERVICE = 'scf';
const API_VERSION = '2018-04-16';
const ALGORITHM = 'TC3-HMAC-SHA256';
const SIGNED_HEADERS = 'content-type;host;x-tc-action';

const sha256Hex = (input: string): string => createHash('sha256').update(input, 'utf8').digest('hex');
const hmacBuf = (key: Buffer | string, data: string): Buffer =>
  createHmac('sha256', key).update(data, 'utf8').digest();

export interface InvokeHeadersInput {
  payload: string;
  region: string;
  secretId: string;
  secretKey: string;
  action?: string;
  timestamp?: number; // epoch 秒；测试固定用
  host?: string; // 签名目标 host（含端口）；缺省按 region 推导真实 API host
}

// TC3 规范请求只签 content-type/host/x-tc-action 三个头（与腾讯云官方签名流程一致）
export function buildInvokeHeaders(input: InvokeHeadersInput): Record<string, string> {
  const { payload, region, secretId, secretKey } = input;
  const action = input.action ?? 'Invoke';
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);

  const host = input.host ?? `scf.${region}.tencentcloudapi.com`;
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${SIGNED_HEADERS}\n${sha256Hex(payload)}`;

  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = `${ALGORITHM}\n${timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const secretDate = hmacBuf(`TC3${secretKey}`, date);
  const secretService = hmacBuf(secretDate, SERVICE);
  const secretSigning = hmacBuf(secretService, 'tc3_request');
  const signature = createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    'Content-Type': 'application/json',
    Host: host,
    'X-TC-Action': action,
    'X-TC-Version': API_VERSION,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Region': region,
    Authorization: `${ALGORITHM} Credential=${secretId}/${credentialScope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`,
  };
}

export interface InvokeScfOptions {
  functionName: string;
  namespace: string;
  region: string;
  secretId: string;
  secretKey: string;
  clientContext: string;
  endpoint?: string; // 端点覆盖（本地容器联调指向 scf-mock）；缺省为腾讯云真实端点
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function invokeScfFunction(opts: InvokeScfOptions): Promise<{ requestId: string | null }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const payload = JSON.stringify({
    FunctionName: opts.functionName,
    Namespace: opts.namespace,
    InvocationType: 'Event',
    ClientContext: opts.clientContext,
  });
  const endpoint = opts.endpoint?.trim() || `https://scf.${opts.region}.tencentcloudapi.com`;
  const host = new URL(endpoint).host;
  const headers = buildInvokeHeaders({ payload, region: opts.region, secretId: opts.secretId, secretKey: opts.secretKey, host });

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
  } catch (err) {
    throw new ScfInvokeError(`云函数 Invoke 网络失败：${(err as Error).message}`);
  }

  let data: { Response?: { Error?: { Code?: string; Message?: string }; RequestId?: string } };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    throw new ScfInvokeError(`云函数 Invoke 响应非 JSON（HTTP ${response.status}）`);
  }

  const body = data.Response ?? {};
  if (body.Error) {
    const { Code = 'Unknown', Message = '' } = body.Error;
    throw new ScfInvokeError(`云函数 Invoke 失败 [${Code}]: ${Message}`, Code);
  }
  return { requestId: body.RequestId ?? null };
}

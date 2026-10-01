import { buildInvokeHeaders, invokeScfFunction, ScfInvokeError } from '@/shared/utils/scf-invoke.util';

// 黄金值由 python3 标准库按 TC3-HMAC-SHA256 官方流程独立计算（与实现解耦的交叉验证），
// 输入：固定 payload / ap-guangzhou / example 凭证 / timestamp=1727000000（UTC 2024-09-22）
const GOLDEN_PAYLOAD =
  '{"FunctionName":"acm-job","Namespace":"default","InvocationType":"Event","ClientContext":"{\\"task\\":\\"inspection\\"}"}';
const GOLDEN_AUTHORIZATION =
  'TC3-HMAC-SHA256 Credential=AKIDexample1234567890/2024-09-22/scf/tc3_request, ' +
  'SignedHeaders=content-type;host;x-tc-action, ' +
  'Signature=f2c649733e9a66b2147c5791c7862336a85cfeb905845aee206ece7530051afc';
// host 覆盖（自定义 host 含端口）下的黄金值：签名覆盖 host，与官方域签名不同
const GOLDEN_AUTHORIZATION_CUSTOM_HOST =
  'TC3-HMAC-SHA256 Credential=AKIDexample1234567890/2024-09-22/scf/tc3_request, ' +
  'SignedHeaders=content-type;host;x-tc-action, ' +
  'Signature=bb5fa0594bc6f389499b9c34a4112c820d5f28f70f876145fa8f13069a8bf4e5';

describe('buildInvokeHeaders', () => {
  it('matches the independently computed golden signature', () => {
    const headers = buildInvokeHeaders({
      payload: GOLDEN_PAYLOAD,
      region: 'ap-guangzhou',
      secretId: 'AKIDexample1234567890',
      secretKey: 'secretKeyExample/2026',
      timestamp: 1727000000,
    });

    expect(headers.Authorization).toBe(GOLDEN_AUTHORIZATION);
  });

  it('emits the full header set with X-TC-Action case preserved', () => {
    const headers = buildInvokeHeaders({
      payload: GOLDEN_PAYLOAD,
      region: 'ap-guangzhou',
      secretId: 'id',
      secretKey: 'key',
      timestamp: 1727000000,
    });

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Host).toBe('scf.ap-guangzhou.tencentcloudapi.com');
    expect(headers['X-TC-Action']).toBe('Invoke'); // 原样大写，签名内部才转小写
    expect(headers['X-TC-Version']).toBe('2018-04-16');
    expect(headers['X-TC-Timestamp']).toBe('1727000000');
    expect(headers['X-TC-Region']).toBe('ap-guangzhou');
  });

  it('signs the overridden host (with port) when provided', () => {
    const headers = buildInvokeHeaders({
      payload: GOLDEN_PAYLOAD,
      region: 'ap-guangzhou',
      secretId: 'AKIDexample1234567890',
      secretKey: 'secretKeyExample/2026',
      timestamp: 1727000000,
      host: '127.0.0.1:9011',
    });

    expect(headers.Host).toBe('127.0.0.1:9011');
    expect(headers.Authorization).toBe(GOLDEN_AUTHORIZATION_CUSTOM_HOST);
  });
});

describe('invokeScfFunction', () => {
  const baseOpts = {
    functionName: 'acm-job',
    namespace: 'default',
    region: 'ap-guangzhou',
    secretId: 'id',
    secretKey: 'key',
    clientContext: '{"task":"inspection"}',
  };

  const jsonImpl = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200 });

  it('posts Invoke payload to the regional endpoint and returns requestId', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonImpl({ Response: { RequestId: 'req-1' } })());

    const result = await invokeScfFunction({ ...baseOpts, fetchImpl: fetchMock as unknown as typeof fetch });

    expect(result).toEqual({ requestId: 'req-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://scf.ap-guangzhou.tencentcloudapi.com');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      FunctionName: 'acm-job',
      Namespace: 'default',
      InvocationType: 'Event',
      ClientContext: '{"task":"inspection"}', // ClientContext 保持字符串，不二次序列化
    });
    expect(init.headers['X-TC-Action']).toBe('Invoke');
  });

  it('posts to the overridden endpoint and signs its host', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonImpl({ Response: { RequestId: 'req-2' } })());

    await invokeScfFunction({ ...baseOpts, endpoint: 'http://127.0.0.1:9011', fetchImpl: fetchMock as unknown as typeof fetch });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:9011');
    expect(init.headers.Host).toBe('127.0.0.1:9011');
  });

  it('throws ScfInvokeError carrying the API error code', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonImpl({ Response: { Error: { Code: 'ResourceNotFound.Function', Message: 'no such fn' } } })());

    await expect(
      invokeScfFunction({ ...baseOpts, fetchImpl: fetchMock as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: 'ResourceNotFound.Function', message: expect.stringContaining('no such fn') });
  });

  it('wraps network failures into ScfInvokeError', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(
      invokeScfFunction({ ...baseOpts, fetchImpl: fetchMock as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ScfInvokeError);
  });

  it('wraps non-JSON responses into ScfInvokeError', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('gateway timeout', { status: 504 }));

    await expect(
      invokeScfFunction({ ...baseOpts, fetchImpl: fetchMock as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ScfInvokeError);
  });
});

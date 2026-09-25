const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const MAX_503_RETRIES = 2;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function buildUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

interface Service503Body {
  code?: string;
  error?: string;
}

// 后端就绪门禁的 503：DB_INITIALIZING（初始化中）按 Retry-After 有限重试；
// DB_DEGRADED（持久故障）抛友好错误。返回 null 表示非门禁 503。
// 注意：每个响应的 body 只能读取一次，解析结果须复用
async function parseGate503(response: Response): Promise<Service503Body | null> {
  if (response.status !== 503) return null;
  try {
    const body = (await response.json()) as Service503Body;
    if (body && (body.code === 'DB_INITIALIZING' || body.code === 'DB_DEGRADED')) return body;
  } catch {
    // 非 JSON body
  }
  return null;
}

const retryAfterMs = (response: Response) =>
  (Number(response.headers.get('Retry-After')) || 2) * 1000;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('acm_token');
  const url = new URL(buildUrl(path), window.location.origin);

  const doFetch = () =>
    fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
      ...options,
    });

  let response = await doFetch();
  let gate = await parseGate503(response);

  for (let retried = 0; gate?.code === 'DB_INITIALIZING' && retried < MAX_503_RETRIES; retried++) {
    await delay(retryAfterMs(response));
    response = await doFetch();
    gate = await parseGate503(response);
  }

  if (response.status === 401) {
    localStorage.removeItem('acm_token');
    localStorage.removeItem('acm_user');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (gate?.code === 'DB_DEGRADED') {
    throw new Error('数据库暂不可用，请稍后重试');
  }
  if (gate?.code === 'DB_INITIALIZING') {
    throw new Error('服务启动中，请稍后重试');
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'API request failed');
  }

  return result.data;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

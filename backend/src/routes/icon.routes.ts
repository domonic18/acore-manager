import { Router } from 'express';
import https from 'https';
import http from 'http';
import { resolveIconUpstreams } from '@/services/icon-upstreams.service';

// 物品图标代理：<img> 无法带 Authorization 头且外网 CDN 可能不可达（本网络实测 zamimg 403），
// 故统一走 /api/icons/:name。上游列表来自 icon-upstreams.service（DB → env → 默认 逐级回落，
// Redis 缓存 60s，系统配置页可改）；URL 模板含 {name} 则按模板替换，不含则按 zamimg 规则追加。
const router = Router();

function upstreamUrl(upstream: string, rawName: string): string {
  const name = rawName.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  if (!/^[a-z0-9_-]+$/i.test(name)) {
    throw new Error('invalid icon name');
  }
  if (upstream.includes('{name}')) {
    return upstream.replace('{name}', encodeURIComponent(name));
  }
  return `${upstream}/${encodeURIComponent(name)}.jpg`;
}

function fetchIcon(url: string): Promise<{ status: number; contentType?: string; body: NodeJS.ReadableStream }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { timeout: 5000, headers: { 'User-Agent': 'acore-manager/1.0' } }, (res) => {
      resolve({ status: res.statusCode ?? 0, contentType: res.headers['content-type'], body: res });
    });
    req.on('timeout', () => req.destroy(new Error('upstream timeout')));
    req.on('error', reject);
  });
}

router.get('/:name', async (req, res) => {
  const upstreams = await resolveIconUpstreams();
  for (const upstream of upstreams) {
    try {
      const url = upstreamUrl(upstream, req.params.name);
      const { status, contentType, body } = await fetchIcon(url);
      if (status !== 200) continue;
      res.set('Content-Type', contentType || 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400');
      body.pipe(res);
      return;
    } catch {
      continue;
    }
  }
  res.status(404).end();
});

export default router;

// SCF Invoke 本地模拟器（仅 dev）：模拟 scf.<region>.tencentcloudapi.com 的 Invoke action。
// 职责：复核 web 容器发来的 TC3-HMAC-SHA256 签名 → 按 InvocationType=Event 语义立即返回 RequestId
// → 以 sibling 容器派生 job 镜像（事件经 SCF_CUSTOM_CONTAINER_EVENT 注入，与生产平台通道一致）。
// 用法见根目录 docker-compose.e2e.yml 与 docs/plan/M0-SCF部署指引.md「本地 Docker 全链路验证」。
import { execFile } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

// 端口用专用变量名：共享 .env 的 PORT=9000 会经 env_file 泄漏进来，不能直接读 PORT
const PORT = Number(process.env.SCF_MOCK_PORT || 9011);
const JOB_IMAGE = process.env.JOB_IMAGE || 'acore-manager-job:local';
const BUILD_CONTEXT = process.env.JOB_BUILD_CONTEXT || '/repo';
const JOB_DOCKERFILE = process.env.JOB_DOCKERFILE || 'docker/Dockerfile.job';
// 与 app 容器一致的哑凭证（compose 注入）；两者都配置时启用 TC3 签名复核
const SECRET_ID = process.env.TENCENT_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENT_SECRET_KEY || '';

// job 容器运行所需 env 白名单（mock 自身经 compose env_file 载入后原样透传）
const FORWARD_ENV_KEYS = [
  'NODE_ENV',
  'LOG_LEVEL',
  'TZ',
  'DB_URL',
  'DB_AUTH',
  'DB_CHARACTERS',
  'DB_WORLD',
  'DB_ACM',
  'ACM_DB_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'LLM_AES_KEY',
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
  'COS_BUCKET',
  'COS_REGION',
  'FEISHU_WEBHOOK_URL',
  'FEISHU_WEBHOOK_SECRET',
  'ACM_WEB_BASE_URL',
];

const log = (...args) => console.log('[scf-mock]', ...args);
const hmacBuf = (key, data) => createHmac('sha256', key).update(data, 'utf8').digest();
const sha256Hex = (input) => createHash('sha256').update(input, 'utf8').digest('hex');

const scfError = (code, message) => ({ Response: { Error: { Code: code, Message: message } }, RequestId: randomUUID() });

function respond(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// 按 TC3 规范独立重算签名（只签 content-type/host/x-tc-action，与腾讯云官方流程一致）；
// region 不参与签名故不校验。返回 {ok, detail}
function verifyTc3(rawBody, headers) {
  const match = /^TC3-HMAC-SHA256 Credential=([^/]+)\/(\d{4}-\d{2}-\d{2})\/scf\/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=([0-9a-f]{64})$/.exec(
    headers.authorization || '',
  );
  if (!match) return { ok: false, detail: 'Authorization 不符合 TC3 约定格式' };
  const [, credentialId, credentialDate, signature] = match;
  if (credentialId !== SECRET_ID) return { ok: false, detail: `Credential 密钥 ID 不匹配：${credentialId}` };

  const timestamp = Number(headers['x-tc-timestamp']);
  if (!Number.isFinite(timestamp)) return { ok: false, detail: '缺少 X-TC-Timestamp' };
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  if (credentialDate !== date) return { ok: false, detail: `Credential 日期 ${credentialDate} 与时间戳推算 ${date} 不一致（TC3 允许 ±5 分钟时钟偏差）` };

  const host = headers.host || '';
  const contentType = (headers['content-type'] || '').trim();
  const action = (headers['x-tc-action'] || '').toLowerCase();
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${action}\n`;
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\ncontent-type;host;x-tc-action\n${sha256Hex(rawBody)}`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${date}/scf/tc3_request\n${sha256Hex(canonicalRequest)}`;
  const secretSigning = hmacBuf(hmacBuf(hmacBuf(`TC3${SECRET_KEY}`, date), 'scf'), 'tc3_request');
  const expected = createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex');
  if (expected !== signature) return { ok: false, detail: `签名不匹配（host=${host}，确认两侧密钥一致）` };
  return { ok: true };
}

// job 镜像缺失时自动构建（/repo 只读挂载仓库根），互斥避免并发重复构建
let building = null;
function ensureJobImage() {
  return new Promise((resolve, reject) => {
    execFile('docker', ['image', 'inspect', JOB_IMAGE], (err) => (err ? reject(new Error('image missing')) : resolve()));
  }).catch(() => {
    if (building) return building;
    log(`job 镜像 ${JOB_IMAGE} 缺失，开始构建（首次约 2-3 分钟）…`);
    building = new Promise((resolve, reject) => {
      // -f 的相对路径按 cwd 解析而非 context，必须基于 context 拼绝对路径
      const dockerfilePath = `${BUILD_CONTEXT}/${JOB_DOCKERFILE}`;
      const build = spawn('docker', ['build', '-f', dockerfilePath, '-t', JOB_IMAGE, BUILD_CONTEXT], { stdio: 'inherit' });
      build.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`docker build exit=${code}`))));
    }).finally(() => {
      building = null;
    });
    return building;
  });
}

function pipePrefixed(stream, prefix) {
  let buffered = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffered += chunk;
    let idx;
    while ((idx = buffered.indexOf('\n')) >= 0) {
      log(prefix, buffered.slice(0, idx));
      buffered = buffered.slice(idx + 1);
    }
  });
  stream.on('end', () => {
    if (buffered) log(prefix, buffered);
  });
}

function runJobContainer(requestId, clientContext) {
  const name = `acm-job-${requestId.slice(0, 8)}`;
  const args = ['run', '--rm', '--name', name, '--add-host', 'host.docker.internal:host-gateway'];
  for (const key of FORWARD_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined && value !== '') args.push('-e', `${key}=${value}`);
  }
  args.push('-e', `SCF_CUSTOM_CONTAINER_EVENT=${clientContext}`, JOB_IMAGE);

  const startedAt = Date.now();
  const job = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  pipePrefixed(job.stdout, `[job ${name}]`);
  pipePrefixed(job.stderr, `[job ${name}]`);
  job.on('error', (err) => log(`[job ${name}] 派生失败：${err.message}（确认挂载了 /var/run/docker.sock 且已装 docker-cli）`));
  job.on('close', (code) => {
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    log(`[job ${name}] 完成 exit=${code} elapsed=${seconds}s`);
  });
}

function handleInvoke(req, res, rawBody) {
  const action = (req.headers['x-tc-action'] || '').toLowerCase();
  if (action !== 'invoke') {
    respond(res, scfError('InvalidAction', `不支持的 Action：${action || '(缺失)'}`));
    return;
  }

  if (SECRET_ID && SECRET_KEY) {
    const verdict = verifyTc3(rawBody, req.headers);
    if (!verdict.ok) {
      log(`签名复核失败：${verdict.detail}`);
      respond(res, scfError('AuthFailure.SignatureFailure', verdict.detail));
      return;
    }
    log('签名复核通过');
  } else {
    log('warn：未配置 TENCENT_SECRET_ID/KEY，跳过签名复核');
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    respond(res, scfError('InvalidParameter', '请求体不是合法 JSON'));
    return;
  }
  const { FunctionName, Namespace, InvocationType, ClientContext } = body;
  if (InvocationType !== 'Event') {
    respond(res, scfError('InvalidParameter', `仅支持 InvocationType=Event，收到 ${String(InvocationType)}`));
    return;
  }
  if (typeof ClientContext !== 'string' || ClientContext === '') {
    respond(res, scfError('InvalidParameter', '缺少 ClientContext（事件 JSON 字符串）'));
    return;
  }

  const requestId = randomUUID();
  log(`invoke 受理 function=${FunctionName} namespace=${Namespace} requestId=${requestId} event=${ClientContext}`);
  respond(res, { Response: { RequestId: requestId } });
  ensureJobImage()
    .then(() => runJobContainer(requestId, ClientContext))
    .catch((err) => log(`job 容器启动失败：${err.message}`));
}

createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => handleInvoke(req, res, Buffer.concat(chunks).toString('utf8')));
}).listen(PORT, () => {
  log(`SCF Invoke 模拟器监听 :${PORT}（JOB_IMAGE=${JOB_IMAGE}，签名复核=${SECRET_ID && SECRET_KEY ? '开' : '关'}）`);
});

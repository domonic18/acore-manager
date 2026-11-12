#!/usr/bin/env node
/**
 * 把已推送到 TCR 的镜像更新到腾讯云 SCF 容器镜像函数（只换镜像，其余配置原样保留）。
 *
 * 为什么不全量重建函数配置：线上函数的镜像端口、超时、环境变量等是人工在控制台调过的，
 * 全量覆盖容易把人工配置打回默认值。这里只调 UpdateFunctionCode 换 Code.ImageConfig。
 *
 * 函数形态（web / job）由 SCF_FUNCTION_KIND 决定，端口由脚本推导、**不接受外部传入**：
 *   web  → ImagePort 9000，函数类型必须是 HTTP
 *   job  → ImagePort -1，函数类型必须是 Event
 * ImagePort 同时决定函数的运行形态，传错会把 Job 函数变成 Web Server 函数。
 * 脚本在更新前、更新后都校验 GetFunction 返回的 Type，形态不符直接中止（更新前中止＝不改动线上）。
 *
 * 环境变量：
 *   TENCENT_SECRET_ID / TENCENT_SECRET_KEY  腾讯云 API 密钥
 *   SCF_REGION          地域（默认 ap-beijing）
 *   SCF_NAMESPACE       函数所在命名空间（staging / production）
 *   SCF_FUNCTION_NAME   函数名
 *   SCF_FUNCTION_KIND   函数形态：web | job
 *   SCF_IMAGE_URI       新镜像 {registry}/{namespace}/{image}:{tag}@sha256:{digest}
 *   SCF_WAIT_TIMEOUT_MS 等待函数生效的上限（默认 600000 = 10 分钟）
 *   SCF_UPDATE_ATTEMPTS UpdateFunctionCode 的尝试次数（默认 2）
 */

import tencentcloud from 'tencentcloud-sdk-nodejs-scf';

const { Client } = tencentcloud.scf.v20180416;

// SCF 用 ImagePort 表达运行形态：Web Server 镜像 9000，Job 镜像 -1
const FUNCTION_KINDS = {
  web: { port: 9000, expectType: 'HTTP' },
  job: { port: -1, expectType: 'Event' },
};

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (!Number.isInteger(nodeMajor) || nodeMajor < 18) {
  console.error(`[scf-deploy] 需要 Node.js ≥ 18，当前 ${process.versions.node}`);
  process.exit(1);
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[scf-deploy] 缺少环境变量 ${name}`);
    process.exit(1);
  }
  return value;
}

const secretId = required('TENCENT_SECRET_ID');
const secretKey = required('TENCENT_SECRET_KEY');
const imageUri = required('SCF_IMAGE_URI');
const region = process.env.SCF_REGION ?? 'ap-beijing';
const namespace = required('SCF_NAMESPACE');
const functionName = required('SCF_FUNCTION_NAME');
const kind = required('SCF_FUNCTION_KIND');
const waitTimeoutMs = Number(process.env.SCF_WAIT_TIMEOUT_MS ?? 600000);
const updateAttempts = Number(process.env.SCF_UPDATE_ATTEMPTS ?? 2);

if (!FUNCTION_KINDS[kind]) {
  console.error(`[scf-deploy] SCF_FUNCTION_KIND 必须是 web | job，当前：${kind}`);
  process.exit(1);
}
const { port: imagePort, expectType } = FUNCTION_KINDS[kind];

if (!/@sha256:[0-9a-f]{64}$/.test(imageUri)) {
  console.error(`[scf-deploy] SCF_IMAGE_URI 必须是 {registry}/{ns}/{image}:{tag}@sha256:{digest} 形式：${imageUri}`);
  process.exit(1);
}

const client = new Client({
  credential: { secretId, secretKey },
  region,
  profile: { httpProfile: { endpoint: 'scf.tencentcloudapi.com' } },
});

/** 取镜像摘要（SCF 回填的 URI 写法可能与传入的 tag 略有差异，只比摘要） */
function digestOf(uri) {
  const m = /@?(sha256:[0-9a-f]{64})$/.exec(uri ?? '');
  return m ? m[1] : uri;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getFunction() {
  return client.GetFunction({ FunctionName: functionName, Namespace: namespace });
}

/**
 * 形态校验：SCF 的 GetFunction 返回 Type（HTTP=Web 函数 / Event=后台与 Job 函数）。
 * Type 缺失时只告警（接口字段可能随版本变化），形态明确不符则抛错。
 */
function assertFunctionType(res, phase) {
  const actual = res.Type;
  if (!actual) {
    console.warn(`[scf-deploy] ${phase}：接口未返回函数类型，跳过形态校验`);
    return;
  }
  if (actual !== expectType) {
    throw new Error(
      `${phase}：函数类型不符，期望 ${expectType}（${kind} 形态），实际 ${actual}` +
        ` —— 已中止，未改动线上函数 ${namespace}/${functionName}`,
    );
  }
  console.log(`[scf-deploy] ${phase}：函数类型 ${actual}（符合 ${kind} 形态）`);
}

async function updateFunctionCode() {
  for (let attempt = 1; attempt <= updateAttempts; attempt += 1) {
    try {
      await client.UpdateFunctionCode({
        FunctionName: functionName,
        Namespace: namespace,
        Code: {
          ImageConfig: {
            ImageType: 'personal',
            ImageUri: imageUri,
            ImagePort: imagePort,
          },
        },
      });
      console.log(`[scf-deploy] UpdateFunctionCode 已受理（尝试 ${attempt}/${updateAttempts}）`);
      return;
    } catch (error) {
      const message = error?.message ?? String(error);
      console.error(`[scf-deploy] UpdateFunctionCode 失败（尝试 ${attempt}/${updateAttempts}）：${message}`);
      if (attempt >= updateAttempts) {
        throw error;
      }
      // 函数可能正处于 Updating 状态（操作冲突），等待后重试
      await sleep(45000);
    }
  }
}

async function waitForActive() {
  const deadline = Date.now() + waitTimeoutMs;
  for (;;) {
    await sleep(15000);
    const res = await getFunction();
    const status = res.Status;
    const current = res.ImageConfig?.ImageUri ?? '';
    console.log(`[scf-deploy] 状态=${status} 类型=${res.Type ?? '未知'} 镜像=${current}`);

    if (status === 'UpdateFailed') {
      throw new Error(`部署失败：${res.StatusDesc || '无错误描述'}`);
    }
    assertFunctionType(res, '更新后校验');
    if (status === 'Active' && digestOf(current) === digestOf(imageUri)) {
      console.log('[scf-deploy] 部署成功');
      return;
    }
    if (status !== 'Active' && status !== 'Updating' && status !== 'Creating') {
      throw new Error(`函数状态异常：${status}`);
    }
    // Active 但镜像摘要仍是旧的：更新尚未滚动完成，继续等
    if (Date.now() > deadline) {
      throw new Error(`等待超时（${Math.round(waitTimeoutMs / 1000)} 秒），当前状态=${status}`);
    }
  }
}

async function main() {
  console.log(`[scf-deploy] 目标函数 ${namespace}/${functionName}（${region}），形态 ${kind}，端口 ${imagePort}`);
  console.log(`[scf-deploy] 新镜像 ${imageUri}`);

  // 更新前先验形态：函数名配错（把 Web 函数填到 Job 位）时直接中止，不动线上
  assertFunctionType(await getFunction(), '更新前校验');

  await updateFunctionCode();
  await waitForActive();
}

main().catch((err) => {
  console.error(`[scf-deploy] 调用失败：${err?.message ?? err}`);
  process.exit(1);
});

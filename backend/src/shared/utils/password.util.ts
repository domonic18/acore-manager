import * as crypto from 'crypto';

/**
 * 验证 SHA1 密码（旧版兼容）
 */
export function verifySha1Password(
  username: string,
  password: string,
  shaPassHash: string,
): boolean {
  const hash = crypto
    .createHash('sha1')
    .update(`${username.toUpperCase()}:${password.toUpperCase()}`)
    .digest('hex')
    .toUpperCase();
  return hash === shaPassHash.toUpperCase();
}

/**
 * 验证 SRP6 密码（新版推荐）
 */
export function verifySRP6Password(
  username: string,
  password: string,
  salt: Buffer,
  verifier: Buffer,
): boolean {
  // SRP6 验证逻辑简化实现
  // 实际实现需与 AzerothCore 服务端一致
  const N = Buffer.from(
    '894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3CB9D',
    'hex',
  );

  const h = crypto.createHash('sha1');
  h.update(`${username.toUpperCase()}:${password.toUpperCase()}`);
  const x = BigInt('0x' + h.digest('hex'));

  const saltBig = BigInt('0x' + salt.toString('hex'));
  const NBig = BigInt('0x' + N.toString('hex'));

  const xCombined = BigInt(
    '0x' +
      crypto
        .createHash('sha1')
        .update(salt.toString('hex') + x.toString(16).padStart(64, '0'), 'hex')
        .digest('hex'),
  );

  const computedVerifier = Buffer.from(
    modPow(7n, xCombined, NBig).toString(16).padStart(64, '0'),
    'hex',
  );

  return computedVerifier.equals(verifier);
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp >> 1n;
    base = (base * base) % mod;
  }
  return result;
}

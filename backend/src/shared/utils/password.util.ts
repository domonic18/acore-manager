import * as crypto from 'crypto';

// AzerothCore / TrinityCore SRP6 constants
const SRP6_N = BigInt('0x894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7');
const SRP6_G = BigInt(7);

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

function toBigIntLE(buf: Buffer): bigint {
  let hex = '';
  for (let i = buf.length - 1; i >= 0; i--) {
    hex += buf[i].toString(16).padStart(2, '0');
  }
  return BigInt('0x' + hex);
}

function toBufferLE(num: bigint, len: number): Buffer {
  let hex = num.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const buf = Buffer.from(hex, 'hex');
  const padded = Buffer.alloc(len);
  for (let i = 0; i < buf.length; i++) {
    padded[i] = buf[buf.length - 1 - i];
  }
  return padded;
}

/**
 * 计算 SRP6 verifier（AzerothCore/TrinityCore 兼容）
 */
export function calculateSRP6Verifier(
  username: string,
  password: string,
  salt: Buffer,
): Buffer {
  const identity = `${username}:${password}`.toUpperCase();
  const h1 = crypto.createHash('sha1').update(identity).digest();
  const h2 = crypto.createHash('sha1').update(Buffer.concat([salt, h1])).digest();
  const x = toBigIntLE(h2);
  const v = modPow(SRP6_G, x, SRP6_N);
  return toBufferLE(v, 32);
}

/**
 * 验证 SRP6 密码（AzerothCore/TrinityCore 兼容）
 */
export function verifySRP6Password(
  username: string,
  password: string,
  salt: Buffer,
  verifier: Buffer,
): boolean {
  const computed = calculateSRP6Verifier(username, password, salt);
  return computed.equals(verifier);
}

import { calculateSRP6Verifier, verifySRP6Password } from '../../../src/shared/utils/password.util';

describe('calculateSRP6Verifier', () => {
  it('produces consistent verifier for same inputs', () => {
    const salt = Buffer.alloc(32, 0xAB);
    const v1 = calculateSRP6Verifier('testuser', 'password123', salt);
    const v2 = calculateSRP6Verifier('testuser', 'password123', salt);

    expect(v1).toEqual(v2);
    expect(v1.length).toBe(32);
  });

  it('produces different verifier for different passwords', () => {
    const salt = Buffer.alloc(32, 0xAB);
    const v1 = calculateSRP6Verifier('testuser', 'password123', salt);
    const v2 = calculateSRP6Verifier('testuser', 'different', salt);

    expect(v1).not.toEqual(v2);
  });

  it('produces different verifier for different usernames', () => {
    const salt = Buffer.alloc(32, 0xAB);
    const v1 = calculateSRP6Verifier('user1', 'password123', salt);
    const v2 = calculateSRP6Verifier('user2', 'password123', salt);

    expect(v1).not.toEqual(v2);
  });
});

describe('verifySRP6Password', () => {
  it('returns true for correct password', () => {
    const salt = Buffer.alloc(32, 0xAB);
    const verifier = calculateSRP6Verifier('testuser', 'password123', salt);

    expect(verifySRP6Password('testuser', 'password123', salt, verifier)).toBe(true);
  });

  it('returns false for incorrect password', () => {
    const salt = Buffer.alloc(32, 0xAB);
    const verifier = calculateSRP6Verifier('testuser', 'password123', salt);

    expect(verifySRP6Password('testuser', 'wrongpassword', salt, verifier)).toBe(false);
  });

  it('returns false for different salt', () => {
    const salt1 = Buffer.alloc(32, 0xAB);
    const salt2 = Buffer.alloc(32, 0xCD);
    const verifier = calculateSRP6Verifier('testuser', 'password123', salt1);

    expect(verifySRP6Password('testuser', 'password123', salt2, verifier)).toBe(false);
  });
});

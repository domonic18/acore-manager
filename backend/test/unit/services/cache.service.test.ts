import { CacheService } from '../../../src/services/cache.service';
import { redis } from '../../../src/config/redis';

jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    setex: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  },
}));

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new CacheService();
  });

  describe('get', () => {
    it('returns parsed JSON on cache hit', async () => {
      (redis.get as jest.Mock).mockResolvedValue('{"key":"value"}');

      const result = await cache.get('test-key');

      expect(result).toEqual({ key: 'value' });
      expect(redis.get).toHaveBeenCalledWith('test-key');
    });

    it('returns null on cache miss', async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);

      const result = await cache.get('missing-key');

      expect(result).toBeNull();
    });

    it('returns null on JSON parse error', async () => {
      (redis.get as jest.Mock).mockResolvedValue('invalid-json');

      const result = await cache.get('bad-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('stores JSON string with custom TTL', async () => {
      (redis.setex as jest.Mock).mockResolvedValue('OK');

      await cache.set('test-key', { foo: 'bar' }, 300);

      expect(redis.setex).toHaveBeenCalledWith('test-key', 300, '{"foo":"bar"}');
    });
  });

  describe('del', () => {
    it('deletes key from redis', async () => {
      (redis.del as jest.Mock).mockResolvedValue(1);

      await cache.del('test-key');

      expect(redis.del).toHaveBeenCalledWith('test-key');
    });
  });

  describe('delPattern', () => {
    it('deletes keys matching pattern', async () => {
      (redis.keys as jest.Mock).mockResolvedValue(['key1', 'key2']);
      (redis.del as jest.Mock).mockResolvedValue(2);

      await cache.delPattern('prefix:*');

      expect(redis.keys).toHaveBeenCalledWith('prefix:*');
      expect(redis.del).toHaveBeenCalledWith('key1', 'key2');
    });

    it('does not delete when no keys match', async () => {
      (redis.keys as jest.Mock).mockResolvedValue([]);

      await cache.delPattern('prefix:*');

      expect(redis.keys).toHaveBeenCalledWith('prefix:*');
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});

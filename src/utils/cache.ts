// Cache configuration
const enableCache = true;
const cacheType = "memory";
const memCacheCapacity = 5000;
const cacheTTL = 3600000;

interface ICache<K, V> {
  get(key: K): V | undefined
  put(key: K, value: V): void
}

export function CreateCache<K, V>(): ICache<K, V> | null {
  if (!enableCache) {
    return null;
  }
  if (cacheType === 'memory') {
    return new LRUCache<K, V>(memCacheCapacity, cacheTTL);
  }
  return null;
}

type CacheItem<V> = {
  value: V;
  expireAt: number | null; // null means never expire
};

class LRUCache<K, V> {
  private cache: Map<K, CacheItem<V>>;
  private capacity: number;
  private TTL: number | null;

  constructor(capacity: number, ttl: number | null = null) {
    if (capacity <= 0) throw new Error("Capacity must be greater than 0");
    this.capacity = capacity;
    this.cache = new Map();
    this.TTL = ttl;
  }

  private isExpired(item: CacheItem<V>): boolean {
    return item.expireAt !== null && item.expireAt <= Date.now();
  }

  get(key: K): V | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    if (this.isExpired(item)) {
      this.cache.delete(key);
      return undefined;
    }

    // update order
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  put(key: K, value: V): void {
    const expireAt = this.TTL !== null ? Date.now() + this.TTL : null;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      this.evictExpiredOrOldest();
    }
    this.cache.set(key, { value, expireAt });
  }

  private evictExpiredOrOldest(): void {
    for (const [key, item] of this.cache) {
      if (this.isExpired(item)) {
        this.cache.delete(key);
        return;
      }
    }

    // if no expired
    const oldestKey = this.cache.keys().next().value;
    this.cache.delete(oldestKey!); // when calling there is at least one key
  }

  // optional clean all expired keys
  cleanExpired(): void {
    for (const [key, item] of this.cache) {
      if (this.isExpired(item)) {
        this.cache.delete(key);
      }
    }
  }

  // get status of cache
  entries(): [K, V][] {
    const result: [K, V][] = [];
    for (const [key, item] of this.cache) {
      if (!this.isExpired(item)) {
        result.push([key, item.value]);
      }
    }
    return result;
  }
}

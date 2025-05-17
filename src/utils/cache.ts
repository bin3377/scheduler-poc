import { MongoCache } from './mongo';

export interface CacheConfig {
  ENABLE_CACHE: boolean,
  CACHE_TYPE: string,
  CACHE_MEM_CAPACITY: number,
  CACHE_TTL: number,
  CACHE_MONGODB_URI: string,
  CACHE_MONGODB_DB: string,
  CACHE_MONGODB_COLLECTION: string,
}

export interface ICache<K, V> {
  get(key: K): V | undefined | Promise<V | undefined>
  put(key: K, value: V): void | Promise<void>
}

export function CreateCache<K, V>(config: CacheConfig): ICache<K, V> | null {
  if (!config.ENABLE_CACHE) {
    return null;
  }
  switch (config.CACHE_TYPE) {
    case 'memory':
      return new LRUCache<K, V>(config.CACHE_MEM_CAPACITY, config.CACHE_TTL);
    case 'mongodb':
      return new MongoCache<K, V>(config.CACHE_MONGODB_URI, config.CACHE_MONGODB_DB, config.CACHE_MONGODB_COLLECTION, config.CACHE_TTL);
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

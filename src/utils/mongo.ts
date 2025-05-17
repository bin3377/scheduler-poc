import { Collection, MongoClient } from 'mongodb';

export class MongoCache<K, V> {

  private uri: string;
  private dbName: string;
  private collectionName: string;
  private ttl: number;

  private client: MongoClient | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(uri: string, dbName: string, collectionName: string, ttl: number) {
    this.uri = uri;
    this.dbName = dbName;
    this.collectionName = collectionName;
    this.ttl = ttl;
  }

  private async initializeOnce(client: MongoClient): Promise<void> {
    const db = client.db(this.dbName);
    const collection = db.collection(this.collectionName);

    await collection.createIndex(
      { key: 1 },
      { unique: true },
    );

    await collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: this.ttl / 1000 },
    );
  }

  private async getMongoCollection(): Promise<Collection> {
    if (!this.client) {
      this.client = new MongoClient(this.uri);
      await this.client.connect();
    }

    if (!this.initPromise) {
      this.initPromise = this.initializeOnce(this.client);
    }

    await this.initPromise;

    const db = this.client.db(this.dbName);
    return db.collection(this.collectionName);
  }


  async get(key: K): Promise<V | undefined> {
    const collection = await this.getMongoCollection();
    const doc = await collection.findOne({ key: key })
    if (doc) {
      const v = doc.value as V;
      return v;
    }
    return undefined;
  }

  async put(key: K, value: V): Promise<void> {
    const collection = await this.getMongoCollection();
    await collection.insertOne({
      key: key,
      value: value,
      createdAt: new Date(),
    });
  }
}

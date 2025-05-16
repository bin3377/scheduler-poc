import { Collection, MongoClient } from 'mongodb';

const uri = 'mongodb://localhost:27017';
const dbName = 'ride-scheduler';
const collectionName = 'direction-result-cache';
const cacheTTL = 3600000

let client: MongoClient | null = null;
let initPromise: Promise<void> | null = null;

async function getMongoCollection(): Promise<Collection> {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }

  if (!initPromise) {
    initPromise = initializeOnce(client);
  }

  await initPromise;

  const db = client.db(dbName);
  return db.collection(collectionName);
}

async function initializeOnce(client: MongoClient): Promise<void> {
  const db = client.db(dbName);
  const collection = db.collection(collectionName);

  await collection.createIndex(
    { key: 1 },
    { unique: true },
  );

  await collection.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: cacheTTL / 1000 },
  );
}

export class MongoCache<K, V> {
  async get(key: K): Promise<V | undefined> {
    console.log(`getting...${key}`)
    const collection = await getMongoCollection();
    const doc = await collection.findOne({key: key})
    if (doc) {
      const v = doc.value as V;
      console.log(JSON.stringify(v))
      return v;
    }
    return undefined;
  }

  async put(key: K, value: V): Promise<void> {
    console.log(`putting...${key}`)
    const collection = await getMongoCollection();
    await collection.insertOne({
      key: key,
      value: value,
      createdAt: new Date(),
    });
  }
}

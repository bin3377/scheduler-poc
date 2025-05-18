import { Collection, MongoClient } from 'mongodb';

export interface MongoConfig {
  readonly TASK_MONGODB_URI: string,
  readonly TASK_MONGODB_DB: string,
  readonly TASK_MONGODB_COLLECTION: string,
}

export class Mongo {

  private readonly config: MongoConfig;

  constructor(config: MongoConfig) {
    this.config = config;
  }

  async getCollection(): Promise<Collection> {
    const client = new MongoClient(this.config.TASK_MONGODB_URI);
    await client.connect();

    const db = client.db(this.config.TASK_MONGODB_DB);
    return db.collection(this.config.TASK_MONGODB_COLLECTION);
  }
}
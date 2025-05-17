import { MongoClient } from 'mongodb';
import { AutoSchedulingRequest } from '../interfaces';

import { v4 } from 'uuid';
import { env } from '..';

interface Task {
  taskId: string,
  requestBody: string,
  status: string,
  createdAt: number,
  updatedAt: number,
  errorMessage?: string,
  responseBody?: string,
}

export async function DoEnqueue(request: AutoSchedulingRequest): Promise<string> {
  const taskId = v4();
  const client = new MongoClient(env.TASK_MONGODB_URI);
  await client.connect();

  const db = client.db(env.TASK_MONGODB_DB);
  const collection = db.collection(env.TASK_MONGODB_COLLECTION);

  await collection.createIndex(
    { taskId: 1 },
    { unique: true },
  );

  await collection.createIndex(
    { updatedAt: 1 },
    { expireAfterSeconds: env.TASK_TTL / 1000 },
  );

  const now = new Date().getTime();
  await collection.insertOne({
    taskId: taskId,
    requestBody: JSON.stringify(request),
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  })

  return taskId;
}

import { v4 } from 'uuid';
import { AutoSchedulingRequest, TaskResponse } from '../interfaces';
import { Mongo, MongoConfig } from './mongo';

export interface TaskConfig extends MongoConfig {
  readonly TASK_TTL: number,
}

export interface Task {
  _id?: string,
  taskId: string,
  requestBody: string,
  status: string,
  createdAt: number,
  updatedAt: number,
  errorMessage?: string,
  responseBody?: string,
}

export class TaskManager {
  private readonly config: TaskConfig

  constructor(config: TaskConfig) {
    this.config = config;
  }

  // create a task in mongodb and return the task UUID
  async CreateTask(request: AutoSchedulingRequest): Promise<string> {
    const collection = await new Mongo(this.config).getCollection();
    const taskId = v4();

    await collection.createIndex(
      { taskId: 1 },
      { unique: true },
    );

    await collection.createIndex(
      { updatedAt: 1 },
      { expireAfterSeconds: this.config.TASK_TTL / 1000 }, // mongo db will cleanup after TTL
    );

    const now = new Date().getTime();
    await collection.insertOne({
      taskId: taskId,
      requestBody: JSON.stringify(request),
      status: TaskStatus.pending,
      createdAt: now,
      updatedAt: now,
    })

    return taskId;
  }

  // get task by id, or null if not found
  async GetTask(taskId: string): Promise<TaskResponse | null> {
    const collection = await new Mongo(this.config).getCollection();
    const doc = await collection.findOne({ taskId: taskId })
    if (doc) {
      const task = doc as unknown as Task;
      return {
        taskId: taskId,
        status: task.status,
        result: task.responseBody ? JSON.parse(task.responseBody) : undefined,
        error: task.errorMessage ? task.errorMessage : undefined,
      };
    }
    return null;
  }
}

export enum TaskStatus {
  pending = 'PENDING',
  processing = 'PROCESSING',
  completed = 'COMPLETED',
  failed = 'FAILED',
}
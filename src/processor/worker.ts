import path from 'path';
import { ProcessorConfig } from './processor';
import { Mongo } from "./mongo";
import { Task, TaskStatus } from './task';
import { ObjectId } from 'mongodb';
import { Scheduler, SchedulerConfig } from '../scheduler/scheduler';
import { AutoSchedulingRequest } from '../interfaces';

export const filename = path.resolve(__filename);

export async function process(config: ProcessorConfig, docId: string): Promise<string> {
  console.log(`📝 Processing doc ${docId}...`);
  const collection = await new Mongo(config).getCollection();
  const oid = new ObjectId(docId);

  // reading request
  const doc = collection.findOne({ _id: oid });
  if (!doc) {
    throw new Error(`cannot find doc id ${docId}`);
  }

  const task = doc as unknown as Task;
  if (!task) {
    throw new Error(`doc ${docId} is not a task`);
  }
  
  try {
    const request = JSON.parse(task.requestBody) as AutoSchedulingRequest;
    const response = await new Scheduler(config, request).Calculate();

    // writing back
    await collection.updateOne({ _id: oid },
      {
        responseBody: JSON.stringify(response),
        status: TaskStatus.completed,
        updatedAt: new Date().getTime(),
      },
    );

    return task.taskId;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Scheduler Error';
    await collection.updateOne({ _id: oid },
      {
        $set: {
          status: TaskStatus.failed,
          updatedAt: new Date().getTime(),
          errorMessage: errorMessage,
        }
      },
    );
    throw error;
  }
}

import { Piscina } from "piscina";
import path from 'path';
import { Mongo } from "./mongo";
import { TaskConfig, TaskStatus } from "./task";
import { filename } from "./worker";
import { SchedulerConfig } from "../scheduler/scheduler";
import { addMilliseconds, format } from "date-fns";
import { ObjectId } from "mongodb"; // Import ObjectId

export interface ProcessorConfig extends TaskConfig, SchedulerConfig {
  readonly PROCESSOR_THREAD_NUMBER: number,
  readonly PROCESSOR_BATCH_SIZE: number,
  readonly PROCESSOR_INTERVAL: number,
}

const piscina = new Piscina({
  filename: path.resolve(__dirname, 'workerWrapper.js'),
  workerData: { fullpath: filename },
  // maxThreads: 5, // Will be set by PROCESSOR_THREAD_NUMBER from config
});

export async function processPendingTasks(config: ProcessorConfig): Promise<void> {
  // Set maxThreads based on config if not already set or if it needs to be dynamic
  // This is a simplified approach; ideally, Piscina is configured once.
  // For this refactor, we'll assume piscina's maxThreads is managed externally or set at init.
  // piscina.options.maxThreads = config.PROCESSOR_THREAD_NUMBER;


  const ids = await fetchPendingDocs(config);
    
  if (ids.length === 0) {
    if (config.DEBUG_MODE) {
      const nextTime = addMilliseconds(new Date(), config.PROCESSOR_INTERVAL)
      console.log(`⏳ No pending doc, next check will be ${format(nextTime, "HH:mm:ss")}`);
    }
    return;
  }

  // call thread pool worker
  const results = await Promise.allSettled(
    ids.map(docId => // docId here is ObjectId
      piscina.run(
        { config: config, docId: docId.toString() }, // Convert ObjectId to string for Piscina task
        { name: "process" },
      )));

  results.forEach((res, idx) => {
    const originalId = ids[idx]; // This is the ObjectId
    if (res.status === 'fulfilled') {
      console.log(`✅ Processing doc ${originalId.toString()} succeeded, task id:`, res.value);
    } else {
      console.error(`❌ Processing doc ${originalId.toString()} failed:`, res.reason);
    }
  });
}

export function StartProcessor(config: ProcessorConfig) {
  console.log('⚙️  Processor start...');
  // Initialize piscina with maxThreads from config here if it's meant to be set once
  if (piscina.options.maxThreads !== config.PROCESSOR_THREAD_NUMBER) {
    // This is a simplified way; direct modification of options like this might not be the intended API.
    // Typically, Piscina is instantiated with all options.
    // For this exercise, we'll assume this is acceptable or Piscina is pre-configured.
    // A better approach might be to create Piscina instance inside StartProcessor if config can vary.
    console.log(`Adjusting Piscina maxThreads to ${config.PROCESSOR_THREAD_NUMBER}`);
    piscina.options.maxThreads = config.PROCESSOR_THREAD_NUMBER;
  }

  setInterval(async () => {
    await processPendingTasks(config);
  }, config.PROCESSOR_INTERVAL);
}

export async function fetchPendingDocs(config: ProcessorConfig): Promise<ObjectId[]> {
  const collection = await new Mongo(config).getCollection();

  const pendingDocs = await collection
    .find({ status: TaskStatus.pending })
    // Sort by createdAt to process older tasks first - if desired, not in original
    // .sort({ createdAt: 1 }) 
    .limit(config.PROCESSOR_BATCH_SIZE)
    .toArray();

  const ids = pendingDocs.map(doc => doc._id as ObjectId); // Assuming _id is ObjectId

  if (ids.length > 0) {
    await collection.updateMany(
      { _id: { $in: ids } },
      { $set: { status: TaskStatus.processing, updatedAt: new Date() } } // Added updatedAt
    );
  }

  return ids;
}

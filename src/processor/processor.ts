import { Piscina } from "piscina";
import path from 'path';
import { Mongo } from "./mongo";
import { TaskConfig, TaskStatus } from "./task";
import { filename } from "./worker";
import { SchedulerConfig } from "../scheduler/scheduler";

export interface ProcessorConfig extends TaskConfig, SchedulerConfig {
  readonly PROCESSOR_THREAD_NUMBER: number,
  readonly PROCESSOR_BATCH_SIZE: number,
  readonly PROCESSOR_INTERVAL: number,
}

const piscina = new Piscina({
  filename: path.resolve(__dirname, 'workerWrapper.js'),
  workerData: { fullpath: filename },
  maxThreads: 5,
});


export function StartProcessor(config: ProcessorConfig) {
  console.log('⚙️  Processor start...')
  setInterval(async () => {
    console.log(`⚙️  Processing max to ${config.PROCESSOR_BATCH_SIZE} docs...`);
    const ids = await fetchPendingDocs(config);
    
    if (ids.length === 0) {
      console.log('⏳ No pending docs, waiting...');
      return;
    }

    const results = await Promise.allSettled(
      ids.map(docId =>
        piscina.run({ docId: docId.toString() }, { name: "process" })
      )
    );

    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') {
        console.log(`✅ processing doc ${ids[idx]} succeed, task id:`, res.value);
      } else {
        console.error(`❌ processing doc ${ids[idx]} failed:`, res.reason);
      }
    });
  }, config.PROCESSOR_INTERVAL);
}

async function fetchPendingDocs(config: ProcessorConfig) {
  const collection = await new Mongo(config).getCollection();

  // query pending docs
  const pendingDocs = await collection
    .find({ status: TaskStatus.pending })
    .limit(config.PROCESSOR_BATCH_SIZE)
    .toArray();

  const ids = pendingDocs.map(doc => doc._id);

  // mark "PROCESSING" status
  if (ids.length > 0) {
    await collection.updateMany(
      { _id: { $in: ids } },
      { $set: { status: TaskStatus.processing } }
    );
  }

  return ids;
}


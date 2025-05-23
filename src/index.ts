import Piscina from 'piscina';
import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import { Scheduler } from './scheduler/scheduler';
import { TaskManager } from './processor/task';
import { AutoSchedulingRequest } from './interfaces';
import { StartProcessor } from './processor/processor';
import path from 'path';

require('dotenv').config();
require('dotenv').config({ path: './.env.local' });

// Load environment variables 
export const env = {
  DEBUG_MODE: process.env.DEBUG_MODE === 'true',

  PORT: Number(process.env.PORT),

  ENABLE_ORIGIN_CHECK: process.env.ENABLE_ORIGIN_CHECK === 'true',
  ACCEPTABLE_ORIGINS: String(process.env.ACCEPTABLE_ORIGINS).split(','),

  DEFAULT_BEFORE_PICKUP_TIME: Number(process.env.DEFAULT_BEFORE_PICKUP_TIME),
  DEFAULT_AFTER_PICKUP_TIME: Number(process.env.DEFAULT_AFTER_PICKUP_TIME),
  DEFAULT_DROPOFF_UNLOADING_TIME: Number(process.env.DEFAULT_DROPOFF_UNLOADING_TIME),

  GOOGLE_API_TOKEN: String(process.env.GOOGLE_API_TOKEN),

  ENABLE_CACHE: process.env.ENABLE_CACHE === 'true',
  CACHE_TYPE: String(process.env.CACHE_TYPE),
  CACHE_TTL: Number(process.env.CACHE_TTL),

  CACHE_MEM_CAPACITY: Number(process.env.CACHE_MEM_CAPACITY),

  CACHE_MONGODB_URI: String(process.env.CACHE_MONGODB_URI),
  CACHE_MONGODB_DB: String(process.env.CACHE_MONGODB_DB),
  CACHE_MONGODB_COLLECTION: String(process.env.CACHE_MONGODB_COLLECTION),

  TASK_TTL: Number(process.env.CACHE_TTL),
  TASK_MONGODB_URI: String(process.env.TASK_MONGODB_URI),
  TASK_MONGODB_DB: String(process.env.TASK_MONGODB_DB),
  TASK_MONGODB_COLLECTION: String(process.env.TASK_MONGODB_COLLECTION),

  PROCESSOR_THREAD_NUMBER: Number(process.env.PROCESSOR_THREAD_NUMBER),
  PROCESSOR_BATCH_SIZE: Number(process.env.PROCESSOR_BATCH_SIZE),
  PROCESSOR_INTERVAL: Number(process.env.PROCESSOR_INTERVAL),
};

const app = express();

if (env.DEBUG_MODE) {
  console.debug(env)
}

// Middleware to parse JSON bodies
app.use(express.json());

// Middleware for basic logging (optional)
app.use((req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Route for /
app.get('/', async (req: ExpressRequest, res: ExpressResponse) => {
  console.log('Handling / path');
  res.status(200).json({});
});

// Route for /v1_webapp_auto_scheduling
app.post('/v1_webapp_auto_scheduling', async (req: ExpressRequest, res: ExpressResponse) => {
  try {

    checkOrigin(req)
    const scheduler = new Scheduler(env, req.body as AutoSchedulingRequest);
    const rspn = await scheduler.Calculate();

    res.status(200).json(rspn);

  } catch (error) {
    errorProcessing(req, res, error);
  }
});

// Route for /v1_webapp_auto_scheduling/enqueue
app.post('/v1_webapp_auto_scheduling/enqueue', async (req: ExpressRequest, res: ExpressResponse) => {
  try {

    checkOrigin(req)
    const taskManager = new TaskManager(env);
    const taskId = await taskManager.CreateTask(req.body as AutoSchedulingRequest);

    res.status(201).json({ taskId: taskId });

  } catch (error) {
    errorProcessing(req, res, error);
  }
});

app.get('/v1_webapp_auto_scheduling/:taskId', async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    checkOrigin(req)
    const taskId = req.params.taskId;

    const taskManager = new TaskManager(env);
    const task = await taskManager.GetTask(taskId);

    if (task) {
      res.status(200).json(task);
    } else {
      res.status(404).json({ error: 'Task not found' });
    }
  } catch (error) {
    errorProcessing(req, res, error);
  }
});

// Catch-all for 404 Not Found
app.use((_: ExpressRequest, res: ExpressResponse) => {
  res.status(404).send('Not Found');
});

const PORT = env.PORT;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

export default app

StartProcessor(env)

class OriginForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OriginForbiddenError";
    Object.setPrototypeOf(this, OriginForbiddenError.prototype);
  }
}

function checkOrigin(req: ExpressRequest) {
  if (env.ENABLE_ORIGIN_CHECK) {
    const origin = req.get('Origin');
    if (!origin || !env.ACCEPTABLE_ORIGINS.includes(origin)) {
      throw new OriginForbiddenError('Forbidden - Invalid origin');
    }
  }
}

function errorProcessing(req: ExpressRequest, res: ExpressResponse, error: any) {
  console.error(`error when processing ${req.path}:`, error);
  if (error instanceof OriginForbiddenError) {
    return res.status(403).json({ error: 'Forbidden - Invalid origin' });
  }

  const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
  res.status(500).json({ error: 'Internal Server Error', details: errorMessage });
}
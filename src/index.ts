import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import { DoSchedule } from './utils/scheduler'; // Adjusted path
import { AutoSchedulingRequest } from './interfaces'; // Adjusted path

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
  try {
    // Cloudflare worker returned null, Express can send an empty JSON object or similar
    res.status(200).json(null);
  } catch (error) {
    console.error('Error in / handler:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Route for /v1_webapp_auto_scheduling
app.post('/v1_webapp_auto_scheduling', async (req: ExpressRequest, res: ExpressResponse) => {
  if (env.ENABLE_ORIGIN_CHECK) {
    const origin = req.get('Origin');
    if (!origin || !env.ACCEPTABLE_ORIGINS.includes(origin)) {
      return res.status(403).json({ error: 'Forbidden - Invalid origin' });
    }
  }

  try {
    // req.body is already parsed by express.json() middleware
    const jsonData: unknown = req.body;
    const rspn = await DoSchedule(jsonData as AutoSchedulingRequest);

    if (typeof rspn === 'string') {
      // If DoSchedule returns a plain string, send it as text/plain
      // The original worker didn't specify content type for string response,
      // but it's good practice.
      res.status(200).type('text/plain').send(rspn);
    } else {
      // If it's an object, send as JSON
      res.status(200).json(rspn);
    }
  } catch (error) {
    if (error instanceof SyntaxError) { // This check might be less relevant if express.json() handles it
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    console.error('Error processing /v1_webapp_auto_scheduling request:', error);
    // Ensure error is an instance of Error to access message property safely
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    res.status(500).json({ error: 'Internal Server Error', details: errorMessage });
  }
});

// Catch-all for 404 Not Found
app.use((req: ExpressRequest, res: ExpressResponse) => {
  res.status(404).send('Not Found');
});

const PORT = env.PORT;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Export the app for potential testing or programmatic use (optional)
export default app;

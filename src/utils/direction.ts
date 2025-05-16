import { CreateCache } from "./cache";

export interface DirectionResult {
  distanceInMeter: number;
  durationInSec: number;
}

const cache = CreateCache<string, DirectionResult>();

export async function GetDirection(from: string, to: string, departureTime: Date): Promise<DirectionResult | null> {

  if (cache) {
    const v = cache.get(`${from}|${to}`)
    if (v) {
      return v;
    }
  }

  const res = await getDirectionFromGoogle(from, to, departureTime);
  
  if (cache && res) {
    cache.put(`${from}|${to}`, res)
  }
  return res;
}

// Define the structure of the Google Maps API response (simplified)
interface GoogleMapsDirectionsResponse {
  routes: Array<{
    legs: Array<{
      distance: {
        text: string;
        value: number; // meters
      };
      duration: {
        text: string;
        value: number; // seconds
      };
    }>;
  }>;
  status: string; // "OK", "ZERO_RESULTS", etc.
  error_message?: string;
}

async function getDirectionFromGoogle(from: string, to: string, departureTime: Date): Promise<DirectionResult | null> {
  const apiKey =  globalThis.currentEnv.API_TOKEN;
  if (!apiKey) {
    throw new Error('Google Maps API key (API_TOKEN) not found in environment.');
  }

  const params = new URLSearchParams({
    origin: from,
    destination: to,
    key: apiKey,
  });
  
  // only append departure_time (in sec) if it's in future, or Google will refuse it
  if (departureTime > new Date()) {
    params.append("departure_time", Math.ceil(departureTime.getTime() / 1000).toString());
  }

  const apiUrl = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;

  const response = await fetch(apiUrl);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Maps API request failed with status ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as GoogleMapsDirectionsResponse;

  if (data.status !== 'OK') {
    throw new Error(`Google Maps API returned status ${data.status}: ${data.error_message || 'No route found or other error.'}`);
  }

  if (!data.routes || data.routes.length === 0 || !data.routes[0].legs || data.routes[0].legs.length === 0) {
    return null;
  }

  const leg = data.routes[0].legs[0];

  // Add result to query and return
  return {
    distanceInMeter: leg.distance.value,
    durationInSec: leg.duration.value,
  };
}

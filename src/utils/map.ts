export interface TripQuery {
  departureTime: Date;
  pickupAddr: string; // Corrected from String
  dropoffAddr: string; // Corrected from String
  bookingId: string; // Added bookingId
}

interface TripInfo extends TripQuery {
  distance: number; // in meters
  timeInSec: number; // in seconds
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

// Define the environment interface expected by GetTrip
interface Env {
  API_TOKEN: string;
}

export async function GetTrip(query: TripQuery, env: Env): Promise<TripInfo> {
  const apiKey = env.API_TOKEN;
  if (!apiKey) {
    throw new Error('Google Maps API key (API_TOKEN) not found in environment.');
  }

  const departureTimestampSeconds = Math.floor(query.departureTime.getTime() / 1000);

  const params = new URLSearchParams({
    origin: query.pickupAddr,
    destination: query.dropoffAddr,
    departure_time: departureTimestampSeconds.toString(),
    key: apiKey,
  });

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
    throw new Error('No routes found for the given query.');
  }

  const leg = data.routes[0].legs[0];

  return {
    ...query,
    distance: leg.distance.value,
    timeInSec: leg.duration.value,
  };
}

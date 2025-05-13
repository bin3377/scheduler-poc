export const GetDirection = async (from: string, to: string, departureTime: Date): Promise<[
  distanceInMeter: number,
  durationInSec: number,
]> => {
  return await getDirectionFromGoogle(from, to, departureTime);
};

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

async function getDirectionFromGoogle(from: string, to: string, departureTime: Date): Promise<[number, number]> {
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
    throw new Error('No routes found for the given query.');
  }

  const leg = data.routes[0].legs[0];

  // Add result to query and return
  return [leg.distance.value, leg.duration.value];
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetTrip } from '../src/utils/map';

// Mock the global fetch function
global.fetch = vi.fn();

const mockEnv = {
  API_TOKEN: 'test_api_key',
};

describe('GetTrip', () => {
  beforeEach(() => {
    vi.resetAllMocks(); // Reset mocks before each test
  });

  const baseQuery = {
    departureTime: new Date('2024-01-01T10:00:00.000Z'),
    pickupAddr: 'Origin Address',
    dropoffAddr: 'Destination Address',
  };

  it('should return trip info for a successful API call', async () => {
    const mockApiResponse = {
      status: 'OK',
      routes: [
        {
          legs: [
            {
              distance: { text: '10 km', value: 10000 },
              duration: { text: '15 mins', value: 900 },
            },
          ],
        },
      ],
    };

    (fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const tripInfo = await GetTrip(baseQuery, mockEnv);

    expect(fetch).toHaveBeenCalledTimes(1);
    const expectedUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=Origin+Address&destination=Destination+Address&departure_time=${Math.floor(baseQuery.departureTime.getTime() / 1000)}&key=test_api_key`;
    expect(fetch).toHaveBeenCalledWith(expectedUrl);

    expect(tripInfo).toEqual({
      ...baseQuery,
      distance: 10000,
      timeInSec: 900,
    });
  });

  it('should throw an error if API_TOKEN is missing', async () => {
    await expect(GetTrip(baseQuery, { API_TOKEN: '' })).rejects.toThrow(
      'Google Maps API key (API_TOKEN) not found in environment.'
    );
  });

  it('should throw an error if API returns a non-OK status', async () => {
    const mockApiResponse = {
      status: 'ZERO_RESULTS',
      error_message: 'No route could be found between the origin and destination.',
    };

    (fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    await expect(GetTrip(baseQuery, mockEnv)).rejects.toThrow(
      'Google Maps API returned status ZERO_RESULTS: No route could be found between the origin and destination.'
    );
  });

  it('should throw an error if API returns OK but no routes', async () => {
    const mockApiResponse = {
      status: 'OK',
      routes: [],
    };

    (fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    await expect(GetTrip(baseQuery, mockEnv)).rejects.toThrow('No routes found for the given query.');
  });
  
  it('should throw an error if API returns OK but no legs in route', async () => {
    const mockApiResponse = {
      status: 'OK',
      routes: [{ legs: [] }],
    };

    (fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    await expect(GetTrip(baseQuery, mockEnv)).rejects.toThrow('No routes found for the given query.');
  });
})

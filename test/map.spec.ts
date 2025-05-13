import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetDirection } from '../src/utils/map';

// Mock the global fetch function
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock environment variables
// Cast to any to bypass TS errors in test environment
const originalEnv = (globalThis as any).currentEnv; 

describe('GetDirection', () => {
  const from = 'Origin_Address';
  const to = 'Destination_Address';
  const futureDepartureTime = new Date(Date.now() + 3600 * 1000); // 1 hour in the future
  const pastDepartureTime = new Date(Date.now() - 3600 * 1000); // 1 hour in the past
  const apiKey = 'test-api-key';

  beforeEach(() => {
    // Reset mocks before each test
    mockFetch.mockReset();
    // Set up mock environment for each test
    // Cast to any to bypass TS errors in test environment
    (globalThis as any).currentEnv = { API_TOKEN: apiKey };
  });

  afterEach(() => {
    // Restore original environment after each test
    // Cast to any to bypass TS errors in test environment
    (globalThis as any).currentEnv = originalEnv;
  });

  it('should return distance and duration for a valid request with future departure time', async () => {
    const mockResponse = {
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
      status: 'OK',
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse), // Added for consistency if needed
    });

    const [distance, duration] = await GetDirection(from, to, futureDepartureTime);

    expect(distance).toBe(10000);
    expect(duration).toBe(900);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toContain(`origin=${encodeURIComponent(from)}`);
    expect(fetchUrl).toContain(`destination=${encodeURIComponent(to)}`);
    expect(fetchUrl).toContain(`key=${apiKey}`);
    expect(fetchUrl).toContain('departure_time='); // Future time should be included
  });

  it('should return distance and duration for a valid request with past departure time', async () => {
      const mockResponse = {
        routes: [
          {
            legs: [
              {
                distance: { text: '12 km', value: 12000 },
                duration: { text: '20 mins', value: 1200 },
              },
            ],
          },
        ],
        status: 'OK',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
      });
  
      const [distance, duration] = await GetDirection(from, to, pastDepartureTime);
  
      expect(distance).toBe(12000);
      expect(duration).toBe(1200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      // expect(fetchUrl).toContain(`origin=${encodeURIComponent(from)}`);
      expect(fetchUrl).toContain(`destination=${encodeURIComponent(to)}`);
      expect(fetchUrl).toContain(`key=${apiKey}`);
      expect(fetchUrl).not.toContain('departure_time='); // Past time should NOT be included
    });

  it('should throw an error if API key is missing', async () => {
    // Cast to any to bypass TS errors in test environment
    (globalThis as any).currentEnv = { API_TOKEN: undefined }; // Simulate missing API key

    await expect(GetDirection(from, to, futureDepartureTime)).rejects.toThrow(
      'Google Maps API key (API_TOKEN) not found in environment.'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should throw an error if fetch request fails', async () => {
    const errorStatus = 500;
    const errorText = 'Internal Server Error';
    mockFetch.mockResolvedValue({
      ok: false,
      status: errorStatus,
      text: async () => errorText,
    });

    await expect(GetDirection(from, to, futureDepartureTime)).rejects.toThrow(
      `Google Maps API request failed with status ${errorStatus}: ${errorText}`
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should throw an error if Google Maps API returns non-OK status', async () => {
    const apiStatus = 'ZERO_RESULTS';
    const errorMessage = 'No route could be found between the origin and destination.';
    const mockResponse = {
      routes: [],
      status: apiStatus,
      error_message: errorMessage,
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse),
    });

    await expect(GetDirection(from, to, futureDepartureTime)).rejects.toThrow(
      `Google Maps API returned status ${apiStatus}: ${errorMessage}`
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

   it('should throw an error if Google Maps API returns OK but no routes', async () => {
      const mockResponse = {
        routes: [], // Empty routes array
        status: 'OK',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
      });
  
      await expect(GetDirection(from, to, futureDepartureTime)).rejects.toThrow(
        'No routes found for the given query.'
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if Google Maps API returns OK but routes[0].legs is empty', async () => {
        const mockResponse = {
          routes: [{ legs: [] }], // Empty legs array
          status: 'OK',
        };
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
          text: async () => JSON.stringify(mockResponse),
        });
    
        await expect(GetDirection(from, to, futureDepartureTime)).rejects.toThrow(
          'No routes found for the given query.'
        );
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
});

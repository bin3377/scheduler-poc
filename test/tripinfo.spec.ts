/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { TripInfo, DoSchedule } from '../src/utils/scheduler';
import { Booking, AutoScheduleRequest } from '../src/interfaces';

// Mock dependencies of scheduler.ts
// vi.mock calls are hoisted. The factory functions will define the mocks.
vi.mock('../src/utils/time', () => ({
  getTimezoneByAddress: vi.fn(),
  getDateTime: vi.fn(),
}));

vi.mock('../src/utils/map', () => ({
  GetDirection: vi.fn(),
}));

// Import the mocked functions. These are now the vi.fn() instances created by the factories above.
import { getTimezoneByAddress, getDateTime } from '../src/utils/time';
import { GetDirection } from '../src/utils/map';

// Assign the imported mocks to constants with the names used throughout the test file.
// Cast to Mock to satisfy TypeScript for methods like .mockReset(), .mockReturnValue().
const mockGetTimezoneByAddress = getTimezoneByAddress as unknown as Mock;
const mockGetDateTime = getDateTime as unknown as Mock;
const mockGetDirection = GetDirection as unknown as Mock;

// Numerical values for MobilityAssistance for assertion, based on enum in scheduler.ts
const MobilityAssistanceValues = {
  Ambulatory: 1,
  Wheelchair: 2,
  Stretcher: 16,
};

// Define a type for our test environment variables for type safety
interface TestEnv {
  DEBUG_MODE: boolean;
  DEFAULT_BEFORE_PICKUP_TIME: number;
  DEFAULT_AFTER_PICKUP_TIME: number;
  DEFAULT_DROPOFF_UNLOADING_TIME: number;
}

declare global {
  var currentEnv: TestEnv;
}

describe('TripInfo', () => {
  let sampleBooking: Booking;
  const mockDate = '2025-05-14';
  const mockBeforePickup = 300; // 5 minutes
  const mockAfterPickup = 600; // 10 minutes
  const mockDropoffUnloading = 120; // 2 minutes

  beforeEach(async () => {
    // Reset mocks for each test
    mockGetTimezoneByAddress.mockReset();
    mockGetDateTime.mockReset();
    mockGetDirection.mockReset();

    // Setup globalThis.currentEnv for fallbacks in config functions
    globalThis.currentEnv = {
      DEBUG_MODE: false,
      DEFAULT_BEFORE_PICKUP_TIME: mockBeforePickup,
      DEFAULT_AFTER_PICKUP_TIME: mockAfterPickup,
      DEFAULT_DROPOFF_UNLOADING_TIME: mockDropoffUnloading,
    };

    const minimalRequestForConfig: AutoScheduleRequest = {
      date: mockDate,
      bookings: [], // Empty, so TripInfo.create isn't called by getSortedTrips during setup
      // vehicles: [], // Removed, not in AutoScheduleRequest
      // drivers: [], // Removed, not in AutoScheduleRequest
      before_pickup_time: mockBeforePickup,
      after_pickup_time: mockAfterPickup,
      dropoff_unloading_time: mockDropoffUnloading,
    };

    // Call DoSchedule to initialize scheduler.config.request internally
    // This makes config.dateStr() etc. work as TripInfo expects
    await DoSchedule(minimalRequestForConfig);

    sampleBooking = {
      trip_id: null,
      program_id: 'PROG01',
      program_name: 'Test Program',
      program_timezone: 'America/New_York',
      booking_id: 'B001',
      passenger_id: 'P001',
      passenger_firstname: 'John',
      passenger_lastname: 'Doe',
      passenger_phone: '555-1234',
      additional_passenger: 0,
      pickup_address_id: 'ADDR01',
      pickup_address: '123 Main St, Anytown, USA',
      pickup_latitude: 34.0522,
      pickup_longitude: -118.2437,
      pickup_account_id: null,
      pickup_time: '10:00',
      dropoff_address_id: 'ADDR02',
      dropoff_address: '456 Oak Ave, Anytown, USA',
      dropoff_latitude: 34.0523,
      dropoff_longitude: -118.2438,
      dropoff_account_id: null,
      scheduled_pickup_time: null,
      scheduled_dropoff_time: null,
      actual_pickup_time: null,
      actual_dropoff_time: null,
      driver_arrival_time: null,
      driver_enroute_time: null,
      travel_time: 0,
      travel_distance: 0,
      ride_status: 0,
      ride_fee: 0,
      total_addl_fee_usd_cents: 0,
      payment: 'N/A',
      insurance_account_id: null,
      payment_complete: false,
      mobility_assistance: ['Wheelchair'],
      admin_note: null,
      trip_complete: false,
      driver_note: null,
      office_note: null,
      flag: false,
      willcall_call_time: null,
      total_seat_count: 1,
    };

    // Configure getDateTime mock for main test calls
    // 10:00 AM PDT on 2025-05-14 is 2025-05-14T17:00:00Z
    // 10:00 AM EDT on 2025-05-14 is 2025-05-14T14:00:00Z
    mockGetDateTime.mockImplementation((dateStrImpl: string, timeStrImpl: string, tzImpl: string) => {
      if (dateStrImpl === mockDate && timeStrImpl === '10:00') {
        if (tzImpl === 'America/Los_Angeles') return new Date('2025-05-14T17:00:00.000Z');
        if (tzImpl === 'America/New_York') return new Date('2025-05-14T14:00:00.000Z');
      }
      // Fallback for unhandled cases, though tests should ensure mocks cover specific scenarios
      return new Date(`${dateStrImpl}T${timeStrImpl}:00.000Z`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-ignore
    delete globalThis.currentEnv; // Clean up globalThis.currentEnv
  });

  describe('TripInfo.create', () => {
    it('should correctly create a TripInfo instance with pickup_address timezone', async () => {
      mockGetTimezoneByAddress.mockReturnValue('America/Los_Angeles');
      mockGetDirection.mockResolvedValue([10000, 1800]); // 10km, 30 minutes

      const expectedDepartureTime = new Date('2025-05-14T17:00:00.000Z');

      const tripInfo = await TripInfo.create(sampleBooking);

      expect(mockGetTimezoneByAddress).toHaveBeenCalledWith(sampleBooking.pickup_address);
      expect(mockGetDateTime).toHaveBeenCalledWith(mockDate, sampleBooking.pickup_time, 'America/Los_Angeles');
      expect(mockGetDirection).toHaveBeenCalledWith(
        sampleBooking.pickup_address,
        sampleBooking.dropoff_address,
        expectedDepartureTime
      );

      expect(tripInfo.booking).toBe(sampleBooking);
      expect(tripInfo.passenger).toBe('P001');
      expect(tripInfo.assistance).toBe(MobilityAssistanceValues.Wheelchair);
      expect(tripInfo.isLast).toBe(false); // Default
      expect(tripInfo.timezone).toBe('America/Los_Angeles');
      expect(tripInfo.departureTime).toEqual(expectedDepartureTime);
      expect(tripInfo.distanceInMeter).toBe(10000);
      expect(tripInfo.durationInSec).toBe(1800);
    });

    it('should use program_timezone if getTimezoneByAddress returns null', async () => {
      mockGetTimezoneByAddress.mockReturnValue(null);
      mockGetDirection.mockResolvedValue([5000, 900]);
      const expectedDepartureTimeNY = new Date('2025-05-14T14:00:00.000Z');

      const tripInfo = await TripInfo.create(sampleBooking);

      expect(tripInfo.timezone).toBe(sampleBooking.program_timezone);
      expect(mockGetDateTime).toHaveBeenCalledWith(mockDate, sampleBooking.pickup_time, sampleBooking.program_timezone);
      expect(tripInfo.departureTime).toEqual(expectedDepartureTimeNY);
    });

    it('should use passenger fullname if passenger_id is an empty string', async () => {
      mockGetTimezoneByAddress.mockReturnValue('America/Los_Angeles');
      mockGetDirection.mockResolvedValue([10000, 1800]);
      const bookingNoId = { ...sampleBooking, passenger_id: "" };
      
      const tripInfo = await TripInfo.create(bookingNoId);
      expect(tripInfo.passenger).toBe(`${sampleBooking.passenger_firstname} ${sampleBooking.passenger_lastname}`);
    });

    it('should correctly parse and merge mobility_assistance types (case-insensitive)', async () => {
      mockGetTimezoneByAddress.mockReturnValue('America/Los_Angeles');
      mockGetDirection.mockResolvedValue([10000, 1800]);

      let booking = { ...sampleBooking, mobility_assistance: ['Ambulatory'] };
      let tripInfo = await TripInfo.create(booking);
      expect(tripInfo.assistance).toBe(MobilityAssistanceValues.Ambulatory);

      booking = { ...sampleBooking, mobility_assistance: ['Stretcher'] };
      tripInfo = await TripInfo.create(booking);
      expect(tripInfo.assistance).toBe(MobilityAssistanceValues.Stretcher);
      
      booking = { ...sampleBooking, mobility_assistance: ['Wheelchair', 'AMBULATORY'] }; // Test case-insensitivity and merging
      tripInfo = await TripInfo.create(booking);
      expect(tripInfo.assistance).toBe(MobilityAssistanceValues.Wheelchair | MobilityAssistanceValues.Ambulatory); // 2 | 1 = 3
      
      booking = { ...sampleBooking, mobility_assistance: ['stretcher', 'wheelchair', 'ambulatory'] };
      tripInfo = await TripInfo.create(booking);
      expect(tripInfo.assistance).toBe(MobilityAssistanceValues.Stretcher | MobilityAssistanceValues.Wheelchair | MobilityAssistanceValues.Ambulatory); // 16 | 2 | 1 = 19
    });
  });

  describe('priority', () => {
    async function createTripWithAssistance(assistanceTypes: string[]): Promise<TripInfo> {
      mockGetTimezoneByAddress.mockReturnValue('America/Los_Angeles');
      mockGetDirection.mockResolvedValue([1000, 100]); // Dummy values
      const booking = { ...sampleBooking, mobility_assistance: assistanceTypes };
      // getDateTime mock will use 'America/Los_Angeles' and '10:00' by default from sampleBooking
      return TripInfo.create(booking);
    }

    it('should return Stretcher if Stretcher assistance is present', async () => {
      const tripInfo = await createTripWithAssistance(['Stretcher', 'Wheelchair']);
      expect(tripInfo.priority()).toBe(MobilityAssistanceValues.Stretcher);
    });

    it('should return Wheelchair if Wheelchair is present and Stretcher is not', async () => {
      let tripInfo = await createTripWithAssistance(['Wheelchair', 'Ambulatory']);
      expect(tripInfo.priority()).toBe(MobilityAssistanceValues.Wheelchair);
      
      tripInfo = await createTripWithAssistance(['Wheelchair']);
      expect(tripInfo.priority()).toBe(MobilityAssistanceValues.Wheelchair);
    });

    it('should return Ambulatory if only Ambulatory assistance is present (or default)', async () => {
      const tripInfo = await createTripWithAssistance(['Ambulatory']);
      expect(tripInfo.priority()).toBe(MobilityAssistanceValues.Ambulatory);
      
      // Test with an unknown assistance type, should default to Ambulatory
      const tripInfoUnknown = await createTripWithAssistance(['UnknownType']);
      expect(tripInfoUnknown.priority()).toBe(MobilityAssistanceValues.Ambulatory);
    });
  });

  describe('startTime', () => {
    let tripInfo: TripInfo;
    // This is 10:00 AM in America/Los_Angeles (PDT) for mockDate as per getDateTime mock
    const baseDepartureTime = new Date('2025-05-14T17:00:00.000Z'); 

    beforeEach(async () => {
      mockGetTimezoneByAddress.mockReturnValue('America/Los_Angeles');
      mockGetDirection.mockResolvedValue([10000, 1800]);
      // getDateTime mock (from outer beforeEach) ensures tripInfo.departureTime is baseDepartureTime
      tripInfo = await TripInfo.create(sampleBooking);
    });

    it('should calculate start time by subtracting beforePickupInSec if not isLast', () => {
      tripInfo.isLast = false;
      const expectedStartTime = new Date(baseDepartureTime.getTime() - mockBeforePickup * 1000);
      expect(tripInfo.startTime()).toEqual(expectedStartTime);
    });

    it('should calculate start time by adding afterPickupInSec if isLast', () => {
      tripInfo.isLast = true;
      const expectedStartTime = new Date(baseDepartureTime.getTime() + mockAfterPickup * 1000);
      expect(tripInfo.startTime()).toEqual(expectedStartTime);
    });
  });

  describe('finishTime', () => {
    let tripInfo: TripInfo;
    const baseDepartureTime = new Date('2025-05-14T17:00:00.000Z');
    const durationInSec = 1800; // 30 minutes, set by mockGetDirection

    beforeEach(async () => {
      mockGetTimezoneByAddress.mockReturnValue('America/Los_Angeles');
      mockGetDirection.mockResolvedValue([10000, durationInSec]); // Ensure this duration is used
      tripInfo = await TripInfo.create(sampleBooking);
      // tripInfo.departureTime will be baseDepartureTime
      // tripInfo.durationInSec will be durationInSec (1800)
    });

    it('should calculate finish time correctly if not isLast', () => {
      tripInfo.isLast = false;
      const expectedFinishTime = new Date(
        baseDepartureTime.getTime() + 
        durationInSec * 1000 + 
        mockDropoffUnloading * 1000
      );
      expect(tripInfo.finishTime()).toEqual(expectedFinishTime);
    });

    it('should calculate finish time correctly if isLast', () => {
      tripInfo.isLast = true;
      const expectedFinishTime = new Date(
        baseDepartureTime.getTime() + 
        mockAfterPickup * 1000 + // This is added for isLast trips
        durationInSec * 1000 + 
        mockDropoffUnloading * 1000
      );
      expect(tripInfo.finishTime()).toEqual(expectedFinishTime);
    });
  });
});

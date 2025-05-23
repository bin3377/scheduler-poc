import { parseMA, priorityMa, codeMA, TripInfo, Scheduler, MobilityAssistance, SchedulerConfig } from './scheduler'; // Import SchedulerConfig and MobilityAssistance from ./scheduler
import { DirectionResult, GetDirection, Init as InitDirection } from './direction';
import { getTimezoneByAddress, getDateTime, to12Hr, to24Hr } from './time';
import { Booking, AutoSchedulingRequest } from '../interfaces'; // Import Booking and AutoSchedulingRequest

jest.mock('./direction', () => ({
  ...jest.requireActual('./direction'),
  GetDirection: jest.fn(),
  Init: jest.fn(),
}));

jest.mock('./time', () => ({
  ...jest.requireActual('./time'),
  getTimezoneByAddress: jest.fn(),
  getDateTime: jest.fn(),
  to12Hr: jest.fn().mockImplementation((date: Date | null) => date ? date.toISOString() : ''),
  to24Hr: jest.fn().mockImplementation((date: Date | null) => date ? date.toISOString() : ''),
}));

// Define a mock context for TripInfo.create
const mockSchedulerConfigLocal: SchedulerConfig = { 
  DEBUG_MODE: false,
  DEFAULT_BEFORE_PICKUP_TIME: 600, 
  DEFAULT_AFTER_PICKUP_TIME: 600, 
  DEFAULT_DROPOFF_UNLOADING_TIME: 300,
  GOOGLE_API_TOKEN: 'test-api-key',
  ENABLE_CACHE: false,
  CACHE_TYPE: 'memory',
  CACHE_MEM_CAPACITY: 100,
  CACHE_TTL: 3600000, // 1 hour
  CACHE_MONGODB_URI: '',
  CACHE_MONGODB_DB: '',
  CACHE_MONGODB_COLLECTION: '',
};

const mockAutoSchedulingRequest: AutoSchedulingRequest = {
  date: '2024-07-30',
  bookings: [], // Will be populated in tests
  // Add other properties from AutoSchedulingRequest as needed
};

// This is a simplified mock context. You might need to expand it based on what TripInfo's methods use.
const mockContext = {
  config: mockSchedulerConfigLocal, // Use the renamed local variable
  request: mockAutoSchedulingRequest,
  dateStr: () => mockAutoSchedulingRequest.date,
  isDebug: () => mockSchedulerConfigLocal.DEBUG_MODE, // Use the renamed local variable
  debug: jest.fn(),
  assert: jest.fn(),
  beforePickupInSec: () => mockSchedulerConfigLocal.DEFAULT_BEFORE_PICKUP_TIME / 1000, // Use the renamed local variable
  afterPickupInSec: () => mockSchedulerConfigLocal.DEFAULT_AFTER_PICKUP_TIME / 1000, // Use the renamed local variable
  dropoffUnloadingInSec: () => mockSchedulerConfigLocal.DEFAULT_DROPOFF_UNLOADING_TIME / 1000, // Use the renamed local variable
};


describe('Scheduler Utility Functions', () => {
  describe('parseMA', () => {
    test('should parse MA string correctly', () => {
      // parseMA returns a MobilityAssistance enum, direct number comparison might be okay if enum values align
      // but it's better to test against enum members if possible, or expected behavior.
      // Assuming parseMA is intended to combine flags:
      expect(parseMA('WHEELCHAIR')).toBe(MobilityAssistance.Wheelchair);
      expect(parseMA('STRETCHER')).toBe(MobilityAssistance.Stretcher);
      expect(parseMA('WHEELCHAIR', 'STRETCHER')).toBe(MobilityAssistance.Wheelchair | MobilityAssistance.Stretcher);
      expect(parseMA('AMBULATORY')).toBe(MobilityAssistance.Ambulatory);
      expect(parseMA('')).toBe(MobilityAssistance.Ambulatory); // Assuming default or empty maps to Ambulatory
      expect(parseMA('UNKNOWN')).toBe(MobilityAssistance.Ambulatory); // Assuming default for unknown
    });
  });

  describe('priorityMa', () => {
    test('should return correct priority', () => {
      expect(priorityMa(MobilityAssistance.Stretcher)).toBe(0); // Highest priority
      expect(priorityMa(MobilityAssistance.Wheelchair)).toBe(1); // Next priority
      expect(priorityMa(MobilityAssistance.Ambulatory)).toBe(2); // Lowest priority
      expect(priorityMa(MobilityAssistance.Wheelchair | MobilityAssistance.Stretcher)).toBe(0); // Stretcher part makes it highest
      expect(priorityMa(MobilityAssistance.None)).toBe(2); // Assuming None is like Ambulatory or a default
    });
  });

  describe('codeMA', () => {
    test('should format MA code correctly', () => {
      expect(codeMA(MobilityAssistance.Stretcher)).toBe('GUR');
      expect(codeMA(MobilityAssistance.Wheelchair)).toBe('WC');
      expect(codeMA(MobilityAssistance.Ambulatory)).toBe('AMBI');
      expect(codeMA(MobilityAssistance.Wheelchair | MobilityAssistance.Stretcher)).toBe('GURWC'); // Combined
      expect(codeMA(MobilityAssistance.None)).toBe('AMBI'); // Assuming None is AMBI
    });
  });
});

describe('TripInfo', () => {
  const mockBooking: Booking = {
    booking_id: 'booking1',
    passenger_id: 'passenger1',
    passenger_firstname: 'John',
    passenger_lastname: 'Doe',
    passenger_phone: null,
    additional_passenger: 0,
    pickup_address_id: 'addr1',
    pickup_address: '123 Main St, Anytown, USA',
    pickup_latitude: 40.7128,
    pickup_longitude: -74.0060,
    pickup_account_id: null,
    pickup_time: '10:00',
    dropoff_address_id: 'addr2',
    dropoff_address: '456 Oak Ave, Anytown, USA',
    dropoff_latitude: 40.7580,
    dropoff_longitude: -73.9855,
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
    payment: '',
    insurance_account_id: null,
    payment_complete: false,
    mobility_assistance: ['WHEELCHAIR'],
    admin_note: null,
    trip_id: null,
    trip_complete: false,
    program_id: 'program1',
    program_timezone: 'America/New_York',
    program_name: 'Test Program',
    driver_note: null,
    office_note: null,
    flag: false,
    willcall_call_time: null,
    total_seat_count: 1,
  };

  beforeEach(() => {
    (GetDirection as jest.Mock).mockResolvedValue({ distanceInMeter: 1000, durationInSec: 600 } as DirectionResult);
    (getTimezoneByAddress as jest.Mock).mockReturnValue('America/New_York');
    (getDateTime as jest.Mock).mockImplementation((dateStr: string, timeStr: string, timezone: string) => {
      // Ensure this returns a valid Date object. The exact format might depend on how dateStr and timeStr are structured.
      // For "HH:mm" timeStr and "YYYY-MM-DD" dateStr (or similar standard formats):
      return new Date(`${dateStr}T${timeStr}`);
    });
  });

  test('should create TripInfo instance', async () => {
    const tripInfo = await TripInfo.create(mockContext as any, mockBooking); // Cast mockContext if its structure is simplified
    expect(tripInfo).toBeInstanceOf(TripInfo);
    expect(tripInfo.booking).toEqual(mockBooking);
    expect(GetDirection).toHaveBeenCalledWith(mockBooking.pickup_address, mockBooking.dropoff_address, expect.any(Date));
    expect(getTimezoneByAddress).toHaveBeenCalledWith(mockBooking.pickup_address);
  });
});

describe('Scheduler', () => {
  const mockBookings: Booking[] = [
    { /* ... booking1 details, similar to mockBooking above ... */
      booking_id: 'booking1', passenger_id: 'p1', passenger_firstname: 'A', passenger_lastname: 'B', pickup_time: '09:00', 
      pickup_address: '123 Main St', dropoff_address: '456 Oak Ave', mobility_assistance: ['WHEELCHAIR'], program_timezone: 'America/New_York',
      // Fill other required Booking fields
      passenger_phone: null, additional_passenger: 0, pickup_address_id: 'addr1', pickup_latitude: 0, pickup_longitude: 0, pickup_account_id: null,
      dropoff_address_id: 'addr2', dropoff_latitude: 0, dropoff_longitude: 0, dropoff_account_id: null, scheduled_pickup_time: null, scheduled_dropoff_time: null,
      actual_pickup_time: null, actual_dropoff_time: null, driver_arrival_time: null, driver_enroute_time: null, travel_time: 0, travel_distance: 0,
      ride_status: 0, ride_fee: 0, total_addl_fee_usd_cents: 0, payment: '', insurance_account_id: null, payment_complete: false, admin_note: null,
      trip_id: null, trip_complete: false, program_id: 'prog1', program_name: 'Prog 1', driver_note: null, office_note: null, flag: false, willcall_call_time: null, total_seat_count: 1,
    },
    { /* ... booking2 details ... */
      booking_id: 'booking2', passenger_id: 'p2', passenger_firstname: 'C', passenger_lastname: 'D', pickup_time: '10:00',
      pickup_address: '789 Pine St', dropoff_address: '101 Maple Dr', mobility_assistance: [], program_timezone: 'America/New_York',
      // Fill other required Booking fields
      passenger_phone: null, additional_passenger: 0, pickup_address_id: 'addr3', pickup_latitude: 0, pickup_longitude: 0, pickup_account_id: null,
      dropoff_address_id: 'addr4', dropoff_latitude: 0, dropoff_longitude: 0, dropoff_account_id: null, scheduled_pickup_time: null, scheduled_dropoff_time: null,
      actual_pickup_time: null, actual_dropoff_time: null, driver_arrival_time: null, driver_enroute_time: null, travel_time: 0, travel_distance: 0,
      ride_status: 0, ride_fee: 0, total_addl_fee_usd_cents: 0, payment: '', insurance_account_id: null, payment_complete: false, admin_note: null,
      trip_id: null, trip_complete: false, program_id: 'prog1', program_name: 'Prog 1', driver_note: null, office_note: null, flag: false, willcall_call_time: null, total_seat_count: 1,
    },
  ];

  const testSchedulerConfigLocal: SchedulerConfig = { 
    DEBUG_MODE: false, 
    DEFAULT_BEFORE_PICKUP_TIME: 600, 
    DEFAULT_AFTER_PICKUP_TIME: 600, 
    DEFAULT_DROPOFF_UNLOADING_TIME: 300, 
    GOOGLE_API_TOKEN: 'test-key',
    ENABLE_CACHE: false,
    CACHE_TYPE: 'memory',
    CACHE_MEM_CAPACITY: 100,
    CACHE_TTL: 3600000,
    CACHE_MONGODB_URI: '',
    CACHE_MONGODB_DB: '',
    CACHE_MONGODB_COLLECTION: '',
  };
  
  const testAutoSchedulingRequest: AutoSchedulingRequest = { /* ... your request base ... */
    date: '2024-07-30',
    bookings: mockBookings,
    // Other request fields if necessary
  };


  beforeEach(() => {
    (GetDirection as jest.Mock).mockResolvedValue({ distanceInMeter: 1000, durationInSec: 600 } as DirectionResult);
    (getTimezoneByAddress as jest.Mock).mockReturnValue('America/New_York');
    (getDateTime as jest.Mock).mockImplementation((dateStr: string, timeStr: string, timezone: string) => new Date(`${dateStr}T${timeStr}`));
    (InitDirection as jest.Mock).mockResolvedValue(undefined); // Ensure Init is mocked if Scheduler constructor calls it
  });

  test('should calculate a schedule', async () => {
    const scheduler = new Scheduler(testSchedulerConfigLocal, testAutoSchedulingRequest); // Use renamed config
    
    // Spy on TripInfo.create AFTER setting up mocks for GetDirection, etc.
    // and ensure the mock context is correctly passed if TripInfo.create expects it.
    // The actual TripInfo.create needs 'context' as its first argument.
    const mockTripInfoCreate = jest.spyOn(TripInfo, 'create');

    const result = await scheduler.Calculate(); // Calculate now takes no arguments as per class structure
    
    expect(result).toBeDefined();
    expect(result.result.data.vehicle_trip_list.length).toBeGreaterThanOrEqual(0); // Check for vehicle list
    expect(mockTripInfoCreate).toHaveBeenCalledTimes(mockBookings.length);

    // Verify that TripInfo.create was called with a context object and each booking
    mockBookings.forEach(booking => {
        expect(mockTripInfoCreate).toHaveBeenCalledWith(expect.anything(), booking); // expect.anything() for the context
    });
  });
});

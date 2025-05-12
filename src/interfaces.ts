export interface TripMetadata {
  trip_id: string | null;
  program_id: string;
  program_name: string;
  program_timezone: string;
}

export interface Booking extends TripMetadata {
  booking_id: string;
  passenger_id: string;
  passenger_firstname: string;
  passenger_lastname: string;
  passenger_phone: string | null;
  additional_passenger: number;
  pickup_address_id: string;
  pickup_address: string;
  pickup_latitude: number;
  pickup_longitude: number;
  pickup_account_id: string | null;
  pickup_time: string; // HH:mm
  dropoff_address_id: string;
  dropoff_address: string;
  dropoff_latitude: number;
  dropoff_longitude: number;
  dropoff_account_id: string | null;
  scheduled_pickup_time: string | null; // h:mm AM/PM
  scheduled_dropoff_time: string | null; // h:mm AM/PM
  actual_pickup_time: string | null; // h:mm AM/PM
  actual_dropoff_time: string | null; // h:mm AM/PM
  driver_arrival_time: string | null; // h:mm AM/PM
  driver_enroute_time: string | null; // h:mm AM/PM
  travel_time: number;
  travel_distance: number;
  ride_status: number;
  ride_fee: number;
  total_addl_fee_usd_cents: number;
  payment: string;
  insurance_account_id: string | null;
  payment_complete: boolean;
  mobility_assistance: string[];
  admin_note: string | null;

  trip_complete: boolean;

  driver_note: string | null;
  office_note: string | null;

  flag: boolean;
  willcall_call_time: any | null;
  total_seat_count: number;
}

export interface AutoScheduleRequest {
  date: string; // "Month Day, Year"
  debug?: boolean
  before_pickup_time?: number; // seconds
  after_pickup_time?: number; // seconds
  pickup_loading_time?: number; // seconds
  dropoff_unloading_time?: number; // seconds
  bookings: Booking[];
}

export interface DriverInfo { // not implemented
  driver_id: null;
  driver_firstname: null;
  driver_lastname: null;
  driver_team_id: null;
  driver_team_name: null;
  driver_team: null;
  driver_action: null;
  driver_shifts: any[];
}

export interface Trip extends TripMetadata, DriverInfo {
  first_pickup_time: string;
  last_dropoff_time: string;
  
  first_pickup_address: string;
  first_pickup_latitude: number;
  first_pickup_longitude: number;
  last_dropoff_address: string;
  last_dropoff_latitude: number;
  last_dropoff_longitude: number;

  notes: null;
  number_of_passengers: number;
  trip_complete: boolean;
  bookings: Booking[]; // always has one item
}

export interface Vehicle extends DriverInfo {
  shuttle_id: string;
  shuttle_make: string;
  shuttle_model: string;
  shuttle_color: string;
  shuttle_license_plate: string;
  shuttle_name: string;
  shuttle_wheelchair: string;
  
  trips: Trip[];
}

export interface AutoScheduleResponse {
  vehicle_trip_list: Vehicle[];
}

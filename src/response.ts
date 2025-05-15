/**
 * Response interface for the trip data API
 */
export interface AutoSchedulingResponse {
  result: AutoSchedulingResult;
}

export interface AutoSchedulingResult {
  status: string;
  error_code: number;
  message: string;
  data: AutoSchedulingResultData;
}

export interface AutoSchedulingResultData {
  vehicle_trip_list: Vehicle[];
}

export interface Vehicle {
  shuttle_id: string | null;
  shuttle_make: string | null;
  shuttle_model: string | null;
  shuttle_color: string | null;
  shuttle_license_plate: string | null;
  shuttle_name: string;
  shuttle_wheelchair: string | null;
  driver_id: string | null;
  driver_firstname: string | null;
  driver_lastname: string | null;
  driver_team_id: string | null;
  driver_team_name: string | null;
  driver_team: string | null;
  trips: Trip[];
}

export interface Trip {
  trip_id: string | null;
  program_id: string;
  program_name: string;
  program_timezone: string;
  first_pickup_time: string;
  last_dropoff_time: string;
  driver_id: string | null;
  driver_firstname: string | null;
  driver_lastname: string | null;
  driver_team_id: string | null;
  driver_team_name: string | null;
  driver_team: string | null;
  driver_action: string | null;
  drivershifts: any[]; // This appears to be an empty array in all cases
  first_pickup_address: string;
  first_pickup_latitude: number;
  first_pickup_longitude: number;
  last_dropoff_address: string;
  last_dropoff_latitude: number;
  last_dropoff_longitude: number;
  notes: string | null;
  number_of_passengers: number;
  trip_complete: boolean;
  bookings: Booking[];
}

export interface Booking {
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
  dropoff_address_id: string;
  dropoff_address: string;
  dropoff_latitude: number;
  dropoff_longitude: number;
  dropoff_account_id: string | null;
  pickup_time: string;
  scheduled_pickup_time: string;
  scheduled_dropoff_time: string;
  actual_pickup_time: string | null;
  actual_dropoff_time: string | null;
  driver_arrival_time: string | null;
  driver_enroute_time: string | null;
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
  trip_id: string | null;
  trip_complete: boolean;
  program_id: string;
  program_timezone: string;
  program_name: string;
  driver_note: string | null;
  office_note: string | null;
  flag: boolean;
  willcall_call_time: WillcallCallTime | null;
  total_seat_count: number;
  booking_agent: string | null;
}

export interface WillcallCallTime {
  __type: string; // Usually "Date"
  iso: string;    // ISO format date string
}

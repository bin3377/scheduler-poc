interface Booking {
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
  trip_id: string | null;
  trip_complete: boolean;
  program_id: string;
  program_timezone: string;
  program_name: string;
  driver_note: string | null;
  office_note: string | null;
  flag: boolean;
  willcall_call_time: object | null;
  total_seat_count: number;
}

export interface AutoScheduleRequest {
  date: string; // "Month Day, Year"
  before_pickup_time: number | null; // seconds
  after_pickup_time: number | null; // seconds
  pickup_loading_time: number | null; // seconds
  dropoff_unloading_time: number | null; // seconds
  bookings: Booking[];
}

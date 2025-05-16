import { format } from "date-fns";
import { AutoSchedulingResponse, Trip, Vehicle } from "../interfaces";
import { TripInfo, VehicleInfo } from "./scheduler";

export function convertToResponse(plan: VehicleInfo[]): AutoSchedulingResponse {
  const vs = plan.map(convertToVehicle)
  
  return {
    result: {
      error_code: 0,
      message: 'Successfully retrieved trips data.',
      status: 'status',
      data: {
        vehicle_trip_list: vs,
      }
    }
  }
}

function convertToVehicle(vehicleInfo: VehicleInfo): Vehicle {
  console.assert(vehicleInfo.trips.length > 0, "empty vehicle")

  const trips = vehicleInfo.trips.map(convertToTrip)

  return {

    trips: trips,
    
    shuttle_name: vehicleInfo.name(),

    shuttle_id: null,
    shuttle_make: null,
    shuttle_model: null,
    shuttle_color: null,
    shuttle_license_plate: null,
    shuttle_wheelchair: null,

    driver_id: null, // trips[0].driver_id,
    driver_firstname: null, // trips[0].driver_firstname,
    driver_lastname: null, // trips[0].driver_lastname,
    driver_team_id: null, // trips[0].driver_team_id,
    driver_team_name: null, // trips[0].driver_team_name,
    driver_team: null, // trips[0].driver_team,

  }
}

function convertToTrip(tripinfo: TripInfo): Trip {
  console.assert(tripinfo.adjustedPickupTime !== null, "null scheduled pickup time");
  console.assert(tripinfo.adjustedDropoffTime !== null, "null scheduled dropoff time");

  const booking = tripinfo.booking

  // clearIrrelevantFields()
  booking.actual_dropoff_time = null;
  booking.actual_pickup_time = null;
  booking.driver_arrival_time = null;
  booking.driver_enroute_time = null;

  booking.scheduled_pickup_time = format(tripinfo.adjustedPickupTime!, "h:mm a..aa") // h:mm AM/PM
  booking.scheduled_dropoff_time = format(tripinfo.adjustedDropoffTime!, "h:mm a..aa") // h:mm AM/PM

  return {
    bookings: [booking],

    trip_id: booking.trip_id,

    program_id: booking.program_id,
    program_name: booking.program_name,
    program_timezone: booking.program_timezone,

    first_pickup_time: format(tripinfo.adjustedPickupTime!, "HH:mm"),

    first_pickup_address: booking.pickup_address,
    first_pickup_latitude: booking.pickup_latitude,
    first_pickup_longitude: booking.pickup_longitude,

    last_dropoff_time: format(tripinfo.adjustedDropoffTime!, "HH:mm"),

    last_dropoff_address: booking.dropoff_address,
    last_dropoff_latitude: booking.dropoff_latitude,
    last_dropoff_longitude: booking.dropoff_longitude,

    driver_id: null,
    driver_firstname: null,
    driver_lastname: null,
    driver_team_id: null,
    driver_team_name: null,
    driver_team: null,
    driver_action: null,
    drivershifts: [],

    notes: null,
    number_of_passengers: 1,
    trip_complete: false,
  }
}

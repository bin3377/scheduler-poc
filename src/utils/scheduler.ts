import { AutoScheduleRequest, Booking, Vehicle, DriverInfo, Trip } from '../interfaces';
import { getDateTime, getTimezoneByAddress } from './time'
import { GetDirection } from './map'

namespace config {

  export var request: AutoScheduleRequest;

  export const dateStr = (): string => {
    return request.date;
  }

  export const isDebug = (): boolean => {
    return request.debug ?? globalThis.currentEnv.DEBUG_MODE;
  }

  export const debug = (...data: any[]) => {
    if (isDebug()) {
      console.debug(...data);
    }
  }

  // Driver need to arrive in advanced for outgoing trip
  export const beforePickupInSec = (): number => {
    return request.before_pickup_time ?? globalThis.currentEnv.DEFAULT_BEFORE_PICKUP_TIME;
  }

  // Acceptable delay time for returning trip
  export const afterPickupInSec = (): number => {
    return request.after_pickup_time ?? globalThis.currentEnv.DEFAULT_AFTER_PICKUP_TIME;
  }

  // export const pickupLoadingInSec = (): number => {
  //   return request.pickup_loading_time ?? globalThis.currentEnv.DEFAULT_PICKUP_LOADING_TIME;
  // }

  // Dropoff unloading time
  // This is the time it takes to unload the passenger from the vehicle after a booking trip
  export const dropoffUnloadingInSec = (): number => {
    return request.dropoff_unloading_time ?? globalThis.currentEnv.DEFAULT_DROPOFF_UNLOADING_TIME;
  }
}

enum MobilityAssistance {
  None = 0,
  Ambulatory = 1 << 0, // 0000 0001  1
  Wheelchair = 1 << 1, // 0000 0010  2
  Stretcher = 1 << 4,  // 0001 0000 16
  All = ~(~0 << 8)     // 1111 1111
}

export class TripInfo {
  booking: Booking

  passenger: string;
  assistance: MobilityAssistance;

  isLast: boolean = false;
  departureTime: Date;
  timezone: string;
  distanceInMeter: number;
  durationInSec: number;

  static async create(booking: Booking): Promise<TripInfo> {
    
    const timezone = getTimezoneByAddress(booking.pickup_address) ?? booking.program_timezone;
    const departureTime = getDateTime(config.dateStr(), booking.pickup_time, timezone);
    const [distanceInMeter, durationInSec] = await GetDirection(booking.pickup_address, booking.dropoff_address, departureTime);

    return new TripInfo(booking, timezone, departureTime, distanceInMeter, durationInSec)
  }
  
  // private constructor since we need async to get distance/duration
  private constructor(booking: Booking, timezone: string, departureTime: Date, distanceInMeter: number, durationInSec: number) {
    this.booking = booking;
    // passenger id or fullname if empty
    this.passenger = !!booking.passenger_id ? booking.passenger_id : `${booking.passenger_firstname} ${booking.passenger_lastname}`;

    const parse = (str: string): MobilityAssistance => {
      switch (str.toUpperCase()) {
        case 'STRETCHER':
          return MobilityAssistance.Stretcher;
        case 'WHEELCHAIR':
          return MobilityAssistance.Wheelchair;
        default:
          return MobilityAssistance.Ambulatory;
      }
    };

    // bitwise merge over parsed array
    this.assistance = booking.mobility_assistance.map(parse).reduce((prev, current) => prev | current);
    this.timezone = timezone;
    this.departureTime = departureTime;
    this.distanceInMeter = distanceInMeter;
    this.durationInSec = durationInSec;
  }

  // moblity assistance type to be used for scheduling
  // Stretcher > Wheelchair > Ambulatory
  priority(): MobilityAssistance {
    const ma = this.assistance;
    return (ma & MobilityAssistance.Stretcher) ? MobilityAssistance.Stretcher : 
      (ma & MobilityAssistance.Wheelchair) ? MobilityAssistance.Wheelchair : MobilityAssistance.Ambulatory;
  }

  // The time vehicle need to arrive at the pickup address
  startTime(): Date {
    if (this.isLast) {
      // for returning trip (e.g. the last trip of same passenger), delay is acceptable
      return new Date(this.departureTime.getTime() + config.afterPickupInSec() * 1000);
    } else {
      // for outgoing trip, driver need be earlier
      return new Date(this.departureTime.getTime() - config.beforePickupInSec() * 1000);
    }
  }

  // The time vehicle finish the the trip and ready to go to the next
  finishTime(): Date {
    if (this.isLast) {
      // for returning trip, we add the possible delay
      return new Date(this.departureTime.getTime() + config.afterPickupInSec() * 1000 + this.durationInSec * 1000 + config.dropoffUnloadingInSec() * 1000);
    } else {
      return new Date(this.departureTime.getTime() + this.durationInSec * 1000 + config.dropoffUnloadingInSec() * 1000);
    }
  }
}

export async function DoSchedule(request: AutoScheduleRequest): Promise<string> {
  config.request = request;
  const map = await getSortedTrips();
  return JSON.stringify(Object.fromEntries(map));
}

async function getSortedTrips(): Promise<Map<MobilityAssistance, Array<TripInfo>>> {

  // Place the trip into priority queues
  const priorityToTrips = new Map<MobilityAssistance, Array<TripInfo>>();

  for (const booking of config.request.bookings) {
    const trip = await TripInfo.create(booking)
    const priority = trip.priority();
    if (!priorityToTrips.has(priority)) {
      priorityToTrips.set(priority, []);
    }
    priorityToTrips.get(priority)!.push(trip);
  }

  // Sort queues by startTime of trip
  for (const trips of priorityToTrips.values()) {
    trips.sort((lhs, rhs) => lhs.startTime().getTime() - rhs.startTime().getTime());
  }

  config.debug('Sorted trips:', JSON.stringify(Object.fromEntries(priorityToTrips)));

  return priorityToTrips;
}

export class ShuttleInfo {

  trips = new Array<TripInfo>();

  addTrip(trip: TripInfo) {

  }
}


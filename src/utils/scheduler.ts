import { AutoSchedulingRequest, AutoSchedulingResponse, Booking, Trip } from '../interfaces';
import { convertToResponse } from './convert'
import { getDateTime, getTimezoneByAddress } from './time'
import { GetDirection, DirectionResult } from './map'
import { addSeconds, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

namespace config {

  export var request: AutoSchedulingRequest;

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


function parseMA(...args: string[]): MobilityAssistance {
  function parse(str: string): MobilityAssistance {
    switch (str.toUpperCase()) {
      case 'STRETCHER':
        return MobilityAssistance.Stretcher;
      case 'WHEELCHAIR':
        return MobilityAssistance.Wheelchair;
      default:
        return MobilityAssistance.Ambulatory;
    }
  }
  return args.map(parse).reduce((prev, current) => prev | current);
}

function priorityMa(ma: MobilityAssistance): number {
  if (ma & MobilityAssistance.Stretcher) {
    return 0;
  }
  if (ma & MobilityAssistance.Wheelchair) {
    return 1;
  }
  return 2;
}

function codeMA(ma: MobilityAssistance): string {
  let name = '';
  if (ma & MobilityAssistance.Stretcher) {
    name += 'GUR';
  }
  if (ma & MobilityAssistance.Wheelchair) {
    name += 'WC';
  } else {
    name += 'AMBI';
  }
  return name;
}

export class TripInfo {
  booking: Booking

  pickupAddress: string;
  dropOffAddress: string;

  passenger: string;
  assistance: MobilityAssistance;

  timezone: string;
  pickupTime: Date;
  distanceInMeter: number;
  durationInSec: number;

  isLast: boolean = false;
  adjustedPickupTime: Date | null = null;
  earliestArrivalTime: Date | null = null;

  static async create(booking: Booking): Promise<TripInfo> {
    
    const timezone = getTimezoneByAddress(booking.pickup_address) ?? booking.program_timezone;
    const pickupTime = getDateTime(config.dateStr(), booking.pickup_time, timezone);
    const result = await GetDirection(booking.pickup_address, booking.dropoff_address, pickupTime);
    if (result === null) {
      throw new Error(`No routes found for the given query from ${booking.pickup_address} to ${booking.dropoff_address}.`)
    }

    return new TripInfo(booking, timezone, pickupTime, result)
  }
  
  // private constructor since we need async to get distance/duration
  private constructor(booking: Booking, timezone: string, pickupTime: Date, direction: DirectionResult) {
    this.booking = booking;

    this.pickupAddress = booking.pickup_address;
    this.dropOffAddress = booking.dropoff_address;

    // passenger id or fullname if empty
    this.passenger = !!booking.passenger_id ? booking.passenger_id : `${booking.passenger_firstname} ${booking.passenger_lastname}`;

    // bitwise merge over parsed array
    this.assistance = parseMA(...booking.mobility_assistance);
    
    this.timezone = timezone;
    this.pickupTime = toZonedTime(pickupTime, timezone);
    this.distanceInMeter = direction.distanceInMeter;
    this.durationInSec = direction.durationInSec;
  }

  short(): string {
    function saddr(input: string):string {
      return input.split(",")[0]
    }
    const book = `${this.booking.booking_id} ${this.booking.pickup_time}`
    const name = `${this.booking.passenger_firstname.charAt(0)}.${this.booking.passenger_lastname.charAt(0)}[${codeMA(this.assistance).padEnd(7)}]`;
    const addr = `${saddr(this.pickupAddress)}-${saddr(this.dropOffAddress)}`
    const time = this.adjustedPickupTime ? `(${format(this.earliestArrivalTime!, "HH:mm")})${format(this.adjustedPickupTime!, "HH:mm")}-${format(this.dropoffTime(), "HH:mm")} ` : " "
    const last = this.isLast ? "[L]" : ""
    return `${book} ${name}: ${time}${addr}${last}`;
  }

  latestPickupTime(): Date {
    if (this.isLast) {
      // for last trip (e.g. return), we can delay with a configured value
      return addSeconds(this.pickupTime, config.afterPickupInSec());
    } else {
      return this.pickupTime;
    }
  }

  dropoffTime(): Date {
    if (this.adjustedPickupTime) {
      return addSeconds(this.adjustedPickupTime, this.durationInSec);
    }
    return addSeconds(this.pickupTime, this.durationInSec);
  }

  finishTime(): Date {
    return addSeconds(this.dropoffTime(), config.dropoffUnloadingInSec());
  }
}

export async function DoSchedule(request: AutoSchedulingRequest): Promise<AutoSchedulingResponse | string> {
  config.request = request;
  const allTrips = await getTripsFromBooking(request.bookings);
  markLastLeg(allTrips)
  const priorityTrips = getPriorityTrips(allTrips);
  const plan: VehicleInfo[] = [];
  for (const trips of priorityTrips) {
    await scheduleTrips(plan, trips);
  }
  config.debug(plainTextPlan(plan))
  if (config.isDebug()) {
    return plainTextPlan(plan)
  }
  return convertToResponse(plan);
}

function plainTextPlan(plan: VehicleInfo[]): string {
  return [
    '=================================================',
    ` Plan of ${config.dateStr()}`,
    '======================BEGIN======================',
    plan.map(v => {
      return [
        `Shuttle = ${v.name()}\n`,
        v.trips.map((t, idx) => {
          return `${idx} ${t.short()}\n`
        }),
      ];
    }),
    '=======================END=======================',
  ].flat().join('\n');
}

// Comparing coming estimated arrival time with current best; true if it's better
function isBetter(coming: Date, current: Date, trip: TripInfo): boolean {
  if (trip.isLast) {
    if (current > trip.pickupTime) { // we are later than booking time
      return coming < current; // earlier is always better
    } else {
      return coming > current; // shorter wait is better
    }
  } else { // outgoing trip
    const earlyArrival = addSeconds(trip.pickupTime, -1 * config.beforePickupInSec());
    if (current > earlyArrival) { // we cannot make enough early arrival
      return coming < current; // earlier is always better
    } else {
      return coming > current; // shorter wait is better
    }
  }
}

async function scheduleTrips(plan: VehicleInfo[], trips: TripInfo[]) {


  for (const trip of trips) {
    config.debug(`[Schedule]: ${trip.short()}`)

    let bestVehicle: VehicleInfo | null = null;
    let bestArrival: Date | null = null;

    for (const vehicle of plan) {
      const arrival = await vehicle.isTripFit(trip);
      if (arrival === null) {
        config.debug(`  [NO]${vehicle.name()}`);
      } else if (bestArrival === null) {
        config.debug(`  [ADD]${vehicle.name()}`);
        bestVehicle = vehicle;
        bestArrival = arrival;
      } else if (isBetter(arrival, bestArrival, trip)) {
        config.debug(`  [REFRESH]${vehicle.name()}: arrival: ${format(arrival, "HH:mm")}, current: ${format(bestArrival, "HH:mm")}`);
        bestVehicle = vehicle;
        bestArrival = arrival;
      } else {
        config.debug(`  [SKIP]${vehicle.name()}: arrival: ${format(arrival, "HH:mm")}, current: ${format(bestArrival, "HH:mm")}`);
      }
    }

    if (bestVehicle === null) {
      // no vehicle can fit this trip, create a new one
      bestVehicle = new VehicleInfo(trip);
      bestVehicle.shuttleIndex = plan.length + 1;
      plan.push(bestVehicle);
      // first trip of the vehicle
      trip.earliestArrivalTime = trip.isLast ? trip.pickupTime : addSeconds(trip.pickupTime, -1 * config.beforePickupInSec());
      config.debug(`[DECISION]new vehicle: ${bestVehicle.name()} # ${format(trip.earliestArrivalTime, "HH:mm")}\n`);
    } else {
      // add trip to the best vehicle we found
      bestVehicle.addTrip(trip);
      trip.earliestArrivalTime = bestArrival
      config.debug(`[DECISION]add to vehicle: ${bestVehicle.name()} # ${format(trip.earliestArrivalTime!, "HH:mm")}\n`);
    }

    // if actual arrival later than booking, we need update
    trip.adjustedPickupTime = (bestArrival === null || bestArrival < trip.pickupTime) ? trip.pickupTime : bestArrival;
  }

}

async function getTripsFromBooking(bookings: Booking[]): Promise<TripInfo[]> {
  // convert bookings to trips
  const trips: TripInfo[] = [];
  for (const booking of bookings) {
    const trip = await TripInfo.create(booking)
    trips.push(trip)
  }
  return trips;
}

function markLastLeg(trips: TripInfo[]) {
  // Sort trips by pickupTime
  trips.sort((lhs, rhs) => lhs.pickupTime.getTime() - rhs.pickupTime.getTime());

  // Mark latest trip of same passenger as last leg
  // map key is passenger id, value is the array of trips (with latest first)
  const m = new Map<string, TripInfo[]>();
  for (let i = trips.length; i > 0; i--) {
    const passenger = trips[i-1].passenger;
    if (!m.has(passenger)) {
      m.set(passenger, []);
    }
    m.get(passenger)!.push(trips[i-1]);
  }
  
  // only mark the passenger last trip if multiple trips in same day
  for (let trips of m.values()) {
    if (trips.length > 1) {
      trips[0].isLast = true;
    }
  }

  if (config.isDebug()) {
    console.log(`Converted ${trips.length} trips:`);
    trips.forEach((v, idx) => {
      console.log(idx, v.short());
    })
  }
}

function getPriorityTrips(trips: TripInfo[]):TripInfo[][] {
  // Place the trip into priority queues 0/1/2
  const priorityTrips: TripInfo[][] = [[],[],[]]
  
  for (const trip of trips) {
    const priority = priorityMa(trip.assistance);
    priorityTrips[priority].push(trip);
  }

  config.debug('priority trips:', priorityTrips.map((v, idx) => `${idx}: ${v.length}`).join(", "));
  return priorityTrips;
}

export class VehicleInfo {

  shuttleIndex: number = 0
  
  trips: TripInfo[] = [];

  constructor(firstTrip: TripInfo) {
    this.trips.push(firstTrip)
  }

  name(): string {
    const code = codeMA(this.trips.map(x => x.assistance).reduce((prev, current) => prev | current));
    return `${this.shuttleIndex}${code}`
  }

  // try to fit next trip into the vehicle, if possible, return the Date of estimated arrival
  async isTripFit(next: TripInfo): Promise<Date | null> {
    console.assert(this.trips.length > 0, "only fit non-empty vehicle");
    const last = this.trips[this.trips.length - 1];

    if (last.finishTime() > next.latestPickupTime()) {
      config.debug(`[NOFIT]${this.name()} - lastFinish: ${format(last.finishTime(), "HH:mm")}, latestPickup: ${format(next.latestPickupTime(), "HH:mm")}`);
      return null;
    }

    if (last.dropOffAddress === next.pickupAddress) {
      config.debug(`[FIT]${this.name()} - same location`);
      return last.finishTime();
    }

    // query the time/distance between last dropoff and next pickup only if they are not same location
    const direction = await GetDirection(last.dropOffAddress, next.pickupAddress, last.finishTime());
    if (direction === null) {
      config.debug(`No routes found for the given query from ${last.dropOffAddress} to ${next.pickupAddress}; skip.`);
      return null;
    }

    const estimatedArrival = addSeconds(last.finishTime(), direction.durationInSec)
    if (estimatedArrival > next.latestPickupTime()) {
      config.debug(`[NOFIT]${this.name()} - estimateArrival: ${format(estimatedArrival, "HH:mm")}, latestPickup: ${format(next.latestPickupTime(), "HH:mm")}`);
      return null
    }
    console.debug(`[FIT]${this.name()} - estimateArrival: ${format(estimatedArrival, "HH:mm")}, latestPickup: ${format(next.latestPickupTime(), "HH:mm")}`);
    return estimatedArrival;
  }

  addTrip(nextTrip: TripInfo) {
    this.trips.push(nextTrip);
  }
}

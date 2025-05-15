import { AutoScheduleRequest, Booking, Vehicle, DriverInfo, Trip } from '../interfaces';
import { getDateTime, getTimezoneByAddress } from './time'
import { GetDirection, DirectionResult } from './map'
import { addMinutes, addSeconds, format } from 'date-fns';

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

  isLast: boolean = false;
  departureTime: Date;
  distanceInMeter: number;
  durationInSec: number;
  arrivalTime: Date;

  static async create(booking: Booking): Promise<TripInfo> {
    
    const timezone = getTimezoneByAddress(booking.pickup_address) ?? booking.program_timezone;
    const departureTime = getDateTime(config.dateStr(), booking.pickup_time, timezone);
    const result = await GetDirection(booking.pickup_address, booking.dropoff_address, departureTime);
    if (result === null) {
      throw new Error(`No routes found for the given query from ${booking.pickup_address} to ${booking.dropoff_address}.`)
    }

    return new TripInfo(booking, departureTime, result)
  }
  
  // private constructor since we need async to get distance/duration
  private constructor(booking: Booking, departureTime: Date, direction: DirectionResult) {
    this.booking = booking;

    this.pickupAddress = booking.pickup_address;
    this.dropOffAddress = booking.dropoff_address;

    // passenger id or fullname if empty
    this.passenger = !!booking.passenger_id ? booking.passenger_id : `${booking.passenger_firstname} ${booking.passenger_lastname}`;

    // bitwise merge over parsed array
    this.assistance = parseMA(...booking.mobility_assistance)
    
    this.departureTime = departureTime;
    this.distanceInMeter = direction.distanceInMeter;
    this.durationInSec = direction.durationInSec;
    this.arrivalTime = new Date(departureTime.getTime() + this.durationInSec * 1000);
  }

  short(): string {
    function addr(input: string):string {
      return input.split(",")[0]
    }
    const name = `${this.booking.passenger_firstname.charAt(0)}.${this.booking.passenger_lastname.charAt(0)}`;
    return `${name}, ${this.booking.pickup_time}, ${addr(this.pickupAddress)} ${codeMA(this.assistance)} (${this.booking.booking_id})`;
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
  const allTrips = await getSortedTrips();
  const priorityTrips = getPriorityTrips(allTrips);
  const plan: VehicleInfo[] = [];
  for (const trips of priorityTrips) {
    console.log(`schedule ${trips.length} trips`)
    await scheduleTrips(plan, trips);
    printPlan(plan);
  }
  // printPlan(plan);
  return JSON.stringify(plan);
}

function printPlan(plan: VehicleInfo[]) {
  console.log();
  console.log(config.dateStr());
  for (const shuttle of plan) {
    console.log();
    console.log('Shuttle -', shuttle.name());
    shuttle.trips.forEach((v, idx) => {
      console.log(v.short());
    })
  }
  console.log();
}

async function scheduleTrips(plan: VehicleInfo[], trips: TripInfo[]) {

  for (const trip of trips) {
    console.debug(`\nSchedule trip: ${trip.short()}\n`)

    let bestVehicle: VehicleInfo | null = null;
    let bestTime: Date | null = null;

    for (const vehicle of plan) {
      const arrivalTime = await vehicle.fitTrip(trip);
      if (arrivalTime === null) {
        console.debug(`[NO]${vehicle.name()}`);
      } else if (bestTime === null){
        console.debug(`[OK]${vehicle.name()} new    - ${format(arrivalTime, "HH:mm")}`);
        bestVehicle = vehicle;
        bestTime = arrivalTime;
      } else if (arrivalTime < bestTime) {
        // new best time
        console.debug(`[OK]${vehicle.name()} better - ${format(arrivalTime, "HH:mm")}`);
        bestVehicle = vehicle;
        bestTime = arrivalTime;
      } else {
        console.debug(`[SKIP]${vehicle.name()} not better`);
      }
    }

    if (bestVehicle === null) {
      // no vehicle can fit this trip, create a new one
      bestVehicle = new VehicleInfo(trip);
      bestVehicle.shuttleIndex = plan.length + 1;
      plan.push(bestVehicle);
      console.debug(`[DECISION]new vehicle: ${bestVehicle.name()}\n`)
    } else {
      // add trip to the best vehicle
      bestVehicle.addTrip(trip);
      console.debug(`[DECISION]exist vehicle: ${bestVehicle.name()}\n`)
    }
  }
}

async function getSortedTrips(): Promise<TripInfo[]> {
  // convert bookings to trips
  const trips: TripInfo[] = [];
  for (const booking of config.request.bookings) {
    const trip = await TripInfo.create(booking)
    trips.push(trip)
  }
  // Sort queues by pickupTime of trip
  trips.sort((lhs, rhs) => lhs.departureTime.getTime() - rhs.departureTime.getTime());

  // Mark last trip of same passenger
  const passengers = new Set<string>();
  for (let i = trips.length; i > 0; i--) {
    const passenger = trips[i-1].passenger;
    if (!passengers.has(passenger)) {
      trips[i-1].isLast = true;
      passengers.add(passenger);
    }
  }
  console.log('all trips:', trips.length);
  return trips;
}

function getPriorityTrips(trips: TripInfo[]):TripInfo[][] {
  // Place the trip into priority queues 0/1/2
  const priorityTrips: TripInfo[][] = [[],[],[]]
  
  for (const trip of trips) {
    const priority = priorityMa(trip.assistance);
    priorityTrips[priority].push(trip);
  }

  console.log('priority trips:', priorityTrips.map(x => x.length).join(", "));
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

  async fitTrip(nextTrip: TripInfo): Promise<Date | null> {
    console.assert(this.trips.length > 0, "only fit non-empty vehicle")

    const lastTrip = this.trips[this.trips.length - 1];
    const lastDropoffTime = addSeconds(lastTrip.arrivalTime, config.dropoffUnloadingInSec()); // need leave time for dropoff

    let nextPickupTime = nextTrip.departureTime;
    if (nextTrip.isLast) {
      // for last trip (e.g. return), we can delay with a configured value
      nextPickupTime = addSeconds(nextPickupTime, config.afterPickupInSec())
    }
    
    if (lastDropoffTime > nextPickupTime) {
      // we have no time machine, FF return
      return null;
    }

    let estimatedArrival = lastDropoffTime;
    
    if (lastTrip.dropOffAddress !== nextTrip.pickupAddress) {
      // query the time/distance between last dropoff and next pickup only if they are not same location
      const direction = await GetDirection(lastTrip.dropOffAddress, nextTrip.pickupAddress, lastDropoffTime);
      if (direction === null) {
        console.debug(`No routes found for the given query from ${lastTrip.dropOffAddress} to ${nextTrip.pickupAddress}; skip.`);
        return null;
      }
      estimatedArrival = addSeconds(lastDropoffTime, direction.durationInSec)
    }

    if (estimatedArrival > nextPickupTime) {
      // no enough time to catch next pickup
      return null
    }

    // shuttle can pickup, need to return the earlist arrival time
    // for last (e.g. return) trip, the estimated arrival can be later than scheduled pickup time. Any shuttle can arrive before pickup time are same when scheduling
    // for outgoing trip, the estimated arrival need be earlier than scheduled pickup time. Any shuttle can arrive before pickup time - beforePickup are same when scheduling
    const requestArrival = nextTrip.isLast ? nextTrip.departureTime : addSeconds(nextPickupTime, config.beforePickupInSec() * -1);
    // for outgoing trip, we need wait before scheduled pickup time
    return (estimatedArrival > requestArrival) ? estimatedArrival : requestArrival;
  }

  addTrip(nextTrip: TripInfo) {
    this.trips.push(nextTrip);
  }
}

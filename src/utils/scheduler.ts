import { AutoSchedulingRequest, AutoSchedulingResponse, Booking } from '../interfaces';
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
  dropOffTime: Date;
  distanceInMeter: number;
  durationInSec: number;

  isLast: boolean = false;
  adjustedPickupTime: Date | null = null;
  adjustedDropoffTime: Date | null = null;

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
    this.dropOffTime = toZonedTime(addSeconds(pickupTime, this.durationInSec), timezone);
  }

  short(): string {
    function saddr(input: string):string {
      return input.split(",")[0]
    }
    const book = `${this.booking.booking_id} ${this.booking.pickup_time}`
    const name = `${this.booking.passenger_firstname.charAt(0)}.${this.booking.passenger_lastname.charAt(0)}[${codeMA(this.assistance).padEnd(7)}]`;
    const addr = `${saddr(this.pickupAddress)}-${saddr(this.dropOffAddress)}`
    const time = this.adjustedDropoffTime === null ? " " : `${format(this.adjustedPickupTime!, "HH:mm")}-${format(this.adjustedDropoffTime!, "HH:mm")} `
    const last = this.isLast ? "[L]" : ""
    return `${book} ${name}: ${time}${addr}${last}`;
  }
}

export async function DoSchedule(request: AutoSchedulingRequest): Promise<AutoSchedulingResponse | string> {
  config.request = request;
  const allTrips = await getSortedTrips();
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

async function scheduleTrips(plan: VehicleInfo[], trips: TripInfo[]) {

  for (const trip of trips) {
    config.debug(`\nSchedule trip: ${trip.short()}\n`)

    let bestVehicle: VehicleInfo | null = null;
    let bestTime: [Date, Date] | null = null;

    for (const vehicle of plan) {
      const fitTime = await vehicle.fitTrip(trip);
      if (fitTime === null) {
        config.debug(`  [NO]${vehicle.name()}`);
      } else if (bestTime === null){
        config.debug(`  [ADD]${vehicle.name()}`);
        bestVehicle = vehicle;
        bestTime = fitTime;
      } else if (fitTime[0] > bestTime![0]) {
        // new best time
        config.debug(`  [BETTER]${vehicle.name()}: fit: ${format(fitTime[0], "HH:mm")}, current: ${format(bestTime![0], "HH:mm")}`);
        bestVehicle = vehicle;
        bestTime = fitTime;
      } else {
        config.debug(`  [SKIP]${vehicle.name()}: fit: ${format(fitTime[0], "HH:mm")}, current: ${format(bestTime![0], "HH:mm")}`);
      }
    }

    if (bestVehicle === null) {
      // update scheduled time as custom requested
      trip.adjustedPickupTime = trip.pickupTime;
      trip.adjustedDropoffTime = trip.dropOffTime;
      // no vehicle can fit this trip, create a new one
      bestVehicle = new VehicleInfo(trip);
      bestVehicle.shuttleIndex = plan.length + 1;
      plan.push(bestVehicle);
      
      config.debug(`[DECISION]new vehicle: ${bestVehicle.name()} # ${format(trip.adjustedPickupTime!, "HH:mm")}\n`);
    } else {
      // this case update scheduled time as real
      console.assert(bestTime !== null, 'null best time');
      trip.adjustedPickupTime = bestTime![0];
      trip.adjustedDropoffTime = bestTime![1];
      // add trip to the best vehicle
      bestVehicle.addTrip(trip);
      
      config.debug(`[DECISION]add to vehicle: ${bestVehicle.name()} # ${format(trip.adjustedPickupTime!, "HH:mm")}\n`);
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
  trips.sort((lhs, rhs) => lhs.pickupTime.getTime() - rhs.pickupTime.getTime());

  // Mark last trip of same passenger
  const passengers = new Set<string>();
  for (let i = trips.length; i > 0; i--) {
    const passenger = trips[i-1].passenger;
    if (!passengers.has(passenger)) {
      trips[i-1].isLast = true;
      passengers.add(passenger);
    }
  }
  config.debug(`converted ${trips.length} booking to trips`);
  for (const trip of trips) {
    console.log(trip.short());
  }
  return trips;
}

function getPriorityTrips(trips: TripInfo[]):TripInfo[][] {
  // Place the trip into priority queues 0/1/2
  const priorityTrips: TripInfo[][] = [[],[],[]]
  
  for (const trip of trips) {
    const priority = priorityMa(trip.assistance);
    priorityTrips[priority].push(trip);
  }

  config.debug('priority trips:', priorityTrips.map(x => x.length).join(", "));
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

  // try next trip on current vehicle, if success, return real start and end time, otherwise null
  async fitTrip(nextTrip: TripInfo): Promise<[Date, Date]| null> {
    console.assert(this.trips.length > 0, "only fit non-empty vehicle")

    const lastTrip = this.trips[this.trips.length - 1];
    console.assert(lastTrip.adjustedDropoffTime !== null, "null adjusted time")
    const lastDropoffTime = addSeconds(lastTrip.adjustedDropoffTime!, config.dropoffUnloadingInSec()); // need leave time for dropoff

    let nextPickupTime = nextTrip.pickupTime;
    if (nextTrip.isLast) {
      // for last trip (e.g. return), we can delay with a configured value
      nextPickupTime = addSeconds(nextPickupTime, config.afterPickupInSec())
    }
    
    if (lastDropoffTime > nextPickupTime) {
      // we have no time machine, FF return
      console.debug(`[NOFIT]${this.name()} - dropoff: ${format(lastDropoffTime, "HH:mm")}, pickup: ${format(nextPickupTime, "HH:mm")}`)
      return null;
    }

    let estimatedArrival = lastDropoffTime;
    
    if (lastTrip.dropOffAddress !== nextTrip.pickupAddress) {
      // query the time/distance between last dropoff and next pickup only if they are not same location
      const direction = await GetDirection(lastTrip.dropOffAddress, nextTrip.pickupAddress, lastDropoffTime);
      if (direction === null) {
        config.debug(`No routes found for the given query from ${lastTrip.dropOffAddress} to ${nextTrip.pickupAddress}; skip.`);
        console.debug(`[NOFIT]${this.name()} - no routes`)
        return null;
      }
      estimatedArrival = addSeconds(lastDropoffTime, direction.durationInSec)
    }

    if (estimatedArrival > nextPickupTime) {
      console.debug(`[NOFIT]${this.name()} - estimate: ${format(estimatedArrival, "HH:mm")}, pickup: ${format(nextPickupTime, "HH:mm")}`)
      // no enough time to catch next pickup
      return null
    }

    // shuttle can pickup, need to return the adjusted pickup/dropoff
    if (nextTrip.isLast) {
      // For last (e.g. return) trip, the pickup can be later than booked time. 
      // Any shuttle can arrive before booked pickup time are same when scheduling
      const adjustedPickupTime = estimatedArrival > nextTrip.pickupTime ? estimatedArrival : nextTrip.pickupTime;
      // Dropoff need to be recalculated by the real pickup time
      const adjustedDropoffTime = addSeconds(adjustedPickupTime, nextTrip.durationInSec);
      console.debug(`[FIT]${this.name()} - estimate: ${format(estimatedArrival, "HH:mm")}, Apickup: ${format(adjustedPickupTime, "HH:mm")}, Adropoff: ${format(adjustedDropoffTime, "HH:mm")}`)
      return [adjustedPickupTime, adjustedDropoffTime];
    } else {
      // For outgoing trip, the pickup need be earlier than scheduled time.
      // Any shuttle can arrive before (pickup time - config.beforePickup) are same when scheduling
      const earliestAcceptable = addSeconds(nextTrip.pickupTime, config.beforePickupInSec() * -1);
      console.debug(`booking pickup: ${format(nextTrip.pickupTime, "HH:mm")}, earliest: ${format(earliestAcceptable, "HH:mm")}`)
      const adjustedPickupTime = estimatedArrival > earliestAcceptable ? estimatedArrival : earliestAcceptable;
      // Even we can get earlier, still wait passenger at booking time to start the trip
      const adjustedDropoffTime = addSeconds(nextTrip.dropOffTime, nextTrip.durationInSec);
      console.debug(`[FIT]${this.name()} - estimate: ${format(estimatedArrival, "HH:mm")}, Apickup: ${format(adjustedPickupTime, "HH:mm")}, Adropoff: ${format(adjustedDropoffTime, "HH:mm")}`)
      return [adjustedPickupTime, adjustedDropoffTime];
    }
  }

  addTrip(nextTrip: TripInfo) {
    this.trips.push(nextTrip);
  }
}

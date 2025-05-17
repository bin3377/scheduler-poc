import { AutoSchedulingRequest, AutoSchedulingResponse, Booking, Trip, Vehicle } from '../interfaces';
import { getDateTime, getTimezoneByAddress, to12Hr, to24Hr } from './time'
import { Init, GetDirection, DirectionResult } from './direction'
import { addSeconds } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export interface SchedulerConfig {
  DEBUG_MODE: boolean,
  DEFAULT_BEFORE_PICKUP_TIME: number,
  DEFAULT_AFTER_PICKUP_TIME: number,
  DEFAULT_DROPOFF_UNLOADING_TIME: number,

  GOOGLE_API_TOKEN: string,

  ENABLE_CACHE: boolean,
  CACHE_TYPE: string,
  CACHE_MEM_CAPACITY: number,
  CACHE_TTL: number,
  CACHE_MONGODB_URI: string,
  CACHE_MONGODB_DB: string,
  CACHE_MONGODB_COLLECTION: string,
}

class context {
  private readonly config: SchedulerConfig;
  private readonly request: AutoSchedulingRequest;

  constructor(config: SchedulerConfig, request: AutoSchedulingRequest) {
    this.config = config;
    this.request = request;
    Init(config);
  }

  dateStr(): string {
    return this.request.date;
  }

  isDebug(): boolean {
    return this.request.debug ?? this.config.DEBUG_MODE;
  }

  debug(...data: any[]) {
    if (this.isDebug()) {
      console.debug(...data);
    }
  }

  assert(cond: boolean, msg: string) {
    if (!cond) {
      console.error(msg);
      if (this.isDebug()) {
        throw new Error(msg);
      }
    }
  }

  // Driver can arrive earlier for outgoing trip
  beforePickupInSec(): number {
    return (this.request.before_pickup_time ?? this.config.DEFAULT_BEFORE_PICKUP_TIME) / 1000;
  }

  // Driver can arrive later for returning trip
  afterPickupInSec(): number {
    return (this.request.after_pickup_time ?? this.config.DEFAULT_AFTER_PICKUP_TIME) / 1000;
  }
  // extra time for dropoff unloading
  dropoffUnloadingInSec(): number {
    return (this.request.dropoff_unloading_time ?? this.config.DEFAULT_DROPOFF_UNLOADING_TIME) / 1000;
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

export class Scheduler {
  private context: context;
  private request: AutoSchedulingRequest;

  constructor(config: SchedulerConfig, request: AutoSchedulingRequest,) {
    this.request = request;
    this.context = new context(config, request);
  }

  async DoSchedule(): Promise<AutoSchedulingResponse> {
    const allTrips = await this.getTripsFromBooking(this.request.bookings);
    this.markLastLeg(allTrips)
    const priorityTrips = this.getPriorityTrips(allTrips);
    const plan: VehicleInfo[] = [];
    for (const trips of priorityTrips) {
      await this.scheduleTrips(plan, trips);
    }
    this.context.debug(this.getTextPlan(plan))
    return this.getResponse(plan);
  }

  private async getTripsFromBooking(bookings: Booking[]): Promise<TripInfo[]> {
    // convert bookings to trips
    const trips: TripInfo[] = [];
    for (const booking of bookings) {
      const trip = await TripInfo.create(this.context, booking)
      trips.push(trip)
    }
    return trips;
  }

  private markLastLeg(trips: TripInfo[]) {
    // Sort trips by pickupTime
    trips.sort((lhs, rhs) => lhs.pickupTime.getTime() - rhs.pickupTime.getTime());

    // Mark latest trip of same passenger as last leg
    // map key is passenger id, value is the array of trips (with latest first)
    const m = new Map<string, TripInfo[]>();
    for (let i = trips.length; i > 0; i--) {
      const passenger = trips[i - 1].passenger;
      if (!m.has(passenger)) {
        m.set(passenger, []);
      }
      m.get(passenger)!.push(trips[i - 1]);
    }

    // only mark the passenger last trip if multiple trips in same day
    for (let trips of m.values()) {
      if (trips.length > 1) {
        trips[0].isLast = true;
      }
    }

    this.context.debug(`Converted ${trips.length} trips:`);
    trips.forEach((v, idx) => {
      this.context.debug(idx, v.short());
    })
  }

  private getPriorityTrips(trips: TripInfo[]): TripInfo[][] {
    // Place the trip into priority queues 0/1/2
    const priorityTrips: TripInfo[][] = [[], [], []]

    for (const trip of trips) {
      const priority = priorityMa(trip.assistance);
      priorityTrips[priority].push(trip);
    }

    this.context.debug('priority trips:', priorityTrips.map((v, idx) => `${idx}: ${v.length}`).join(", "));
    return priorityTrips;
  }

  private async scheduleTrips(plan: VehicleInfo[], trips: TripInfo[]) {

    for (const trip of trips) {
      this.context.debug(`[Schedule]: ${trip.short()}`)

      let bestVehicle: VehicleInfo | null = null;
      let bestArrival: Date | null = null;

      for (const vehicle of plan) {
        const arrival = await this.isTripFitVehicle(vehicle, trip);
        if (arrival === null) {
          this.context.debug(`  [NO]${vehicle.name()}`);
        } else if (bestArrival === null) {
          this.context.debug(`  [ADD]${vehicle.name()}`);
          bestVehicle = vehicle;
          bestArrival = arrival;
        } else if (this.isBetter(arrival, bestArrival, trip)) {
          this.context.debug(`  [REFRESH]${vehicle.name()}: arrival: ${to12Hr(arrival)}, current: ${to12Hr(bestArrival)}`);
          bestVehicle = vehicle;
          bestArrival = arrival;
        } else {
          this.context.debug(`  [SKIP]${vehicle.name()}: arrival: ${to12Hr(arrival)}, current: ${to12Hr(bestArrival)}`);
        }
      }

      if (bestVehicle === null) {
        // no vehicle can fit this trip, create a new one
        bestVehicle = new VehicleInfo(plan.length + 1, trip);
        plan.push(bestVehicle);
        // first trip of the vehicle
        trip.earliestArrivalTime = trip.isLast ? trip.pickupTime : addSeconds(trip.pickupTime, -1 * this.context.beforePickupInSec());
        this.context.debug(`[DECISION]new vehicle: ${bestVehicle.name()} # ${to12Hr(trip.earliestArrivalTime)}`);
      } else {
        // add trip to the best vehicle we found
        bestVehicle.addTrip(trip);
        trip.earliestArrivalTime = bestArrival
        this.context.debug(`[DECISION]add to vehicle: ${bestVehicle.name()} # ${to12Hr(trip.earliestArrivalTime!)}`);
      }

      // if actual arrival later than booking, we need update
      trip.adjustedPickupTime = (bestArrival === null || bestArrival < trip.pickupTime) ? trip.pickupTime : bestArrival;
    }

  }


  // try to fit next trip into the vehicle, if possible, return the Date of estimated arrival
  private async isTripFitVehicle(vehicle: VehicleInfo, next: TripInfo): Promise<Date | null> {
    const name = vehicle.name();
    this.context.assert(vehicle.trips.length > 0, 'only fit non-empty vehicle');
    const last = vehicle.trips[vehicle.trips.length - 1];

    if (last.finishTime() > next.latestPickupTime()) {
      this.context.debug(`[NOFIT]${name} - lastFinish: ${to12Hr(last.finishTime())}, latestPickup: ${to12Hr(next.latestPickupTime())}`);
      return null;
    }

    if (last.dropOffAddress === next.pickupAddress) {
      this.context.debug(`[FIT]${name} - same location`);
      return last.finishTime();
    }

    // query the time/distance between last dropoff and next pickup only if they are not same location
    const direction = await GetDirection(last.dropOffAddress, next.pickupAddress, last.finishTime());
    if (direction === null) {
      this.context.debug(`No routes found for the given query from ${last.dropOffAddress} to ${next.pickupAddress}; skip.`);
      return null;
    }

    const estimatedArrival = addSeconds(last.finishTime(), direction.durationInSec)
    if (estimatedArrival > next.latestPickupTime()) {
      this.context.debug(`[NOFIT]${name} - estimateArrival: ${to12Hr(estimatedArrival)}, latestPickup: ${to12Hr(next.latestPickupTime())}`);
      return null
    }
    this.context.debug(`[FIT]${name} - estimateArrival: ${to12Hr(estimatedArrival)}, latestPickup: ${to12Hr(next.latestPickupTime())}`);
    return estimatedArrival;
  }


  // Comparing coming estimated arrival time with current best; true if it's better
  private isBetter(coming: Date, current: Date, trip: TripInfo): boolean {
    if (trip.isLast) {
      if (current > trip.pickupTime) { // we are later than booking time
        return coming < current; // earlier is always better
      } else {
        return coming > current; // shorter wait is better
      }
    } else { // outgoing trip
      const earlyArrival = addSeconds(trip.pickupTime, -1 * this.context.beforePickupInSec());
      if (current > earlyArrival) { // we cannot make enough early arrival
        return coming < current; // earlier is always better
      } else {
        return coming > current; // shorter wait is better
      }
    }
  }

  private getTextPlan(plan: VehicleInfo[]): string {
    return [
      '=================================================',
      ` Plan of ${this.context.dateStr()}`,
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

  private getResponse(plan: VehicleInfo[]): AutoSchedulingResponse {
    const vs = plan.map(v => v.toVehicle())

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
}

class TripInfo {
  private readonly context: context
  readonly booking: Booking

  readonly pickupAddress: string;
  readonly dropOffAddress: string;

  readonly passenger: string;
  readonly assistance: MobilityAssistance;

  readonly timezone: string;
  readonly pickupTime: Date;
  readonly distanceInMeter: number;
  readonly durationInSec: number;

  isLast: boolean = false;
  adjustedPickupTime: Date | null = null;
  earliestArrivalTime: Date | null = null;

  static async create(context: context, booking: Booking): Promise<TripInfo> {
    const timezone = getTimezoneByAddress(booking.pickup_address) ?? booking.program_timezone;
    const pickupTime = getDateTime(context.dateStr(), booking.pickup_time, timezone);
    const result = await GetDirection(booking.pickup_address, booking.dropoff_address, pickupTime);
    if (result === null) {
      throw new Error(`No routes found for the given query from ${booking.pickup_address} to ${booking.dropoff_address}.`)
    }

    return new TripInfo(context, booking, timezone, pickupTime, result)
  }

  // private constructor since we need async to get distance/duration
  private constructor(context: context, booking: Booking, timezone: string, pickupTime: Date, direction: DirectionResult) {
    this.context = context;
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

    // write back to booking
    booking.travel_distance = direction.distanceInMeter;
    booking.travel_time = direction.durationInSec;
  }

  short(): string {
    function saddr(input: string): string {
      return input.split(",")[0]
    }
    const book = `${this.booking.booking_id} ${this.booking.pickup_time}`
    const name = `${this.booking.passenger_firstname.charAt(0)}.${this.booking.passenger_lastname.charAt(0)}[${codeMA(this.assistance).padEnd(7)}]`;
    const addr = `${saddr(this.pickupAddress)}-${saddr(this.dropOffAddress)}`
    const time = this.adjustedPickupTime ? `(${to12Hr(this.earliestArrivalTime!)})${to12Hr(this.adjustedPickupTime!)}-${to12Hr(this.dropoffTime())} ` : " "
    const last = this.isLast ? "[L]" : ""
    return `${book} ${name}: ${time}${addr}${last}`;
  }

  latestPickupTime(): Date {
    if (this.isLast) {
      // for last trip (e.g. return), we can delay with a configured value
      return addSeconds(this.pickupTime, this.context.afterPickupInSec());
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
    return addSeconds(this.dropoffTime(), this.context.dropoffUnloadingInSec());
  }

  toTrip(): Trip {
    const booking = this.booking;

    // clearIrrelevantFields()
    booking.actual_dropoff_time = null;
    booking.actual_pickup_time = null;
    booking.driver_arrival_time = null;
    booking.driver_enroute_time = null;

    booking.scheduled_pickup_time = to24Hr(this.adjustedPickupTime!) // h:mm AM/PM
    booking.scheduled_dropoff_time = to24Hr(this.dropoffTime()) // h:mm AM/PM

    return {
      bookings: [booking],

      trip_id: booking.trip_id,

      program_id: booking.program_id,
      program_name: booking.program_name,
      program_timezone: booking.program_timezone,


      first_pickup_address: booking.pickup_address,
      first_pickup_latitude: booking.pickup_latitude,
      first_pickup_longitude: booking.pickup_longitude,

      last_dropoff_address: booking.dropoff_address,
      last_dropoff_latitude: booking.dropoff_latitude,
      last_dropoff_longitude: booking.dropoff_longitude,

      first_pickup_time: to12Hr(this.adjustedPickupTime!),
      last_dropoff_time: to12Hr(this.dropoffTime()),

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

}


class VehicleInfo {
  private readonly idx: number;
  readonly trips: TripInfo[] = [];

  constructor(idx: number, firstTrip: TripInfo) {
    this.idx = idx;
    this.trips.push(firstTrip);
  }

  name(): string {
    const code = codeMA(this.trips.map(x => x.assistance).reduce((prev, current) => prev | current));
    return `${this.idx}${code}`
  }

  addTrip(nextTrip: TripInfo) {
    this.trips.push(nextTrip);
  }

  toVehicle(): Vehicle {
    const trips = this.trips.map(t => t.toTrip());
    return {
      trips: trips,

      shuttle_name: this.name(),

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
}

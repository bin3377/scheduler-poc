import { AutoScheduleRequest, Booking, Trip, Vehicle, DriverInfo } from '../interfaces';
import { getDateByDateTimeAddress } from './time';
import { GetDirection } from './map';

// used to query a single leg
export interface LegInfo {
  bookingId: string;
  
  mobilityAssistance: Set<MobilityAssistance>;
  priority: MobilityAssistance;

  pessagner: string;
  isLastLegForPassenger: boolean; // true if this is the last leg for the passenger
  
  fromAddr: string;
  toAddr: string;
  departureTime: Date;

  // ony after query direction
  distanceInMeter?: number; 
  durationInSec?: number;
}

function priority(ma: {mobilityAssistance: Set<MobilityAssistance>}): MobilityAssistance {
  if (ma.mobilityAssistance.has(MobilityAssistance.Stretcher)) {
    return MobilityAssistance.Stretcher;
  } else if (ma.mobilityAssistance.has(MobilityAssistance.Wheelchair)) {
    return MobilityAssistance.Wheelchair;
  } else {
    return MobilityAssistance.Ambulatory;
  }
}

export async function DoSchedule(request: AutoScheduleRequest): Promise<string> {
  config.request = request;
  const map = await getSortedLegs(request);
  return JSON.stringify(Object.fromEntries(map));
}

namespace config {
  
  export var request: AutoScheduleRequest 
  
  export const isDebug = (): boolean => {
    return request.debug ?? globalThis.currentEnv.DEBUG_MODE
  }

  export const debug = (...data: any[]) => {
    if (isDebug()) {
      console.debug(...data);
    }
  }

  export const beforePickupInSec = (): number => {
    return request.before_pickup_time ?? globalThis.currentEnv.DEFAULT_BEFORE_PICKUP_TIME;
  }

  export const afterPickupInSec = (): number => {
    return request.after_pickup_time ?? globalThis.currentEnv.DEFAULT_AFTER_PICKUP_TIME;
  }

  export const pickupLoadingInSec = (): number => {
    return request.pickup_loading_time ?? globalThis.currentEnv.DEFAULT_PICKUP_LOADING_TIME;
  }
  
  export const dropoffUnloadingInSec = (): number => {
    return request.dropoff_unloading_time ?? globalThis.currentEnv.DEFAULT_DROPOFF_UNLOADING_TIME;
  }
}

async function getSortedLegs(request: AutoScheduleRequest): Promise<Map<MobilityAssistance, Array<LegInfo>>> {
  const dateStr = request.date;
  const allLegs = new Map<MobilityAssistance, Array<LegInfo>>();

  for (const booking of request.bookings) {
    const leg = await getLegInfo(dateStr, booking);

    if (!allLegs.has(leg.priority)) {
      allLegs.set(leg.priority, []);
    }
    allLegs.get(leg.priority)!.push(leg);
  }

  // Sort queries by departureTime
  for (const category of allLegs.keys()) {
    let legs = allLegs.get(category)!;
    legs.sort((lhs, rhs) => lhs.departureTime.getTime() - rhs.departureTime.getTime());
    markLastLegForPassengers(legs);
    allLegs.set(category, legs);
  }

  config.debug('Sorted legs:', JSON.stringify(Object.fromEntries(allLegs)));

  return allLegs
}

// Mark the last leg for each passenger with backward iteration (legs are sorted by departure time)
function markLastLegForPassengers(legs: Array<LegInfo>): void {
  let pessengers: Set<string> = new Set<string>();

  for (let i = legs.length; i > 0; i--) {
    const leg = legs[i-1];
    if (pessengers.has(leg.pessagner)) {
      continue;
    }
    leg.isLastLegForPassenger = true;
    pessengers.add(leg.pessagner);
  }
}

// Get updated LegInfo from single Booking 
export async function getLegInfo(dateStr: string, booking: Booking): Promise<LegInfo> {
  const departureTime = getDateByDateTimeAddress(dateStr, booking.pickup_time, booking.pickup_address);
  const [distanceInMeter, durationInSec] = await GetDirection(booking.pickup_address, booking.dropoff_address, departureTime);
  const mobilityAssistance = new Set<MobilityAssistance>(booking.mobility_assistance.map((str) => {
    switch (str) {
      case 'Stretcher':
        return MobilityAssistance.Stretcher;
      case 'Wheelchair':
        return MobilityAssistance.Wheelchair;
      default:
        return MobilityAssistance.Ambulatory;
    }
  }));

  const priority = mobilityAssistance.has(MobilityAssistance.Stretcher) ? 
    MobilityAssistance.Stretcher : mobilityAssistance.has(MobilityAssistance.Wheelchair) ? 
      MobilityAssistance.Wheelchair : MobilityAssistance.Ambulatory;

  return {
    bookingId: booking.booking_id,

    pessagner: `${booking.passenger_firstname} ${booking.passenger_lastname}`,
    isLastLegForPassenger: false,
    
    mobilityAssistance: mobilityAssistance,
    priority: priority,
    
    fromAddr: booking.pickup_address.replace(/^"(.+)"$/,'$1'),
    toAddr: booking.dropoff_address.replace(/^"(.+)"$/,'$1'),
    departureTime: departureTime,

    distanceInMeter: distanceInMeter,
    durationInSec: durationInSec,
  };
}

interface Shuttle {
  index: number;
  assistanceTypes: Set<string>;
  legs: Array<LegInfo>;
}

enum MobilityAssistance {
  Stretcher = 'Stretcher',
  Wheelchair = 'Wheelchair',
  Ambulatory = 'Ambulatory',
}

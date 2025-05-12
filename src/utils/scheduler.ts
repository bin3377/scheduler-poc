import { AutoScheduleRequest, Booking, Trip, Vehicle, DriverInfo } from '../interfaces';
import { getDateByDateTimeAddress } from './time';
import { GetDirection } from './map';

// used to query a single leg
export interface LegInfo {
  bookingId: string;
  departureTime: Date;
  fromAddr: string;
  toAddr: string;
  
  // ony after query direction
  distanceInMeter?: number; 
  durationInSec?: number;
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

async function getSortedLegs(request: AutoScheduleRequest): Promise<Map<BookingCategory, Array<LegInfo>>> {
  const dateStr = request.date;
  const allLegs = new Map<BookingCategory, Array<LegInfo>>();

  for (const booking of request.bookings) {
    const category = getBookingCategory(booking);
    const leg = await getLegInfo(dateStr, booking);

    if (!allLegs.has(category)) {
      allLegs.set(category, []);
    }
    allLegs.get(category)!.push(leg);
  }

  // Sort queries by departureTime
  for (const category of allLegs.keys()) {
    allLegs.get(category)!.sort((lhs, rhs) => lhs.departureTime.getTime() - rhs.departureTime.getTime());
  }

  if (config.isDebug()) {
    console.debug('Sorted legs:', JSON.stringify(Object.fromEntries(allLegs)));
  }

  return allLegs
}

enum BookingCategory {
  Stretcher = 'STRETCHER',
  Wheelchair = 'WHEELCHAIR',
  Ambulatory = 'AMBULATORY',
}

// Get updated LegInfo from single Booking 
async function getLegInfo(dateStr: string, booking: Booking): Promise<LegInfo> {
  const departureTime = getDateByDateTimeAddress(dateStr, booking.pickup_time, booking.pickup_address);
  const legInfo: LegInfo = await GetDirection({
    bookingId: booking.booking_id,
    fromAddr: booking.pickup_address.replace(/^"(.+)"$/,'$1'),
    toAddr: booking.dropoff_address.replace(/^"(.+)"$/,'$1'),
    departureTime: departureTime,
  });
  return legInfo;
}

function getBookingCategory(booking: Booking): BookingCategory {
  if (booking.mobility_assistance && booking.mobility_assistance.some(item => item.toUpperCase() === BookingCategory.Stretcher)) {
    return BookingCategory.Stretcher;
  }
  if (booking.mobility_assistance && booking.mobility_assistance.some(item => item.toUpperCase() === BookingCategory.Wheelchair)) {
    return BookingCategory.Wheelchair;
  }
  return BookingCategory.Ambulatory; // for any other, assume Ambulatory
}

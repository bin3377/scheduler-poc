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
  const map = await getSortedLegs(request);
  return JSON.stringify(Object.fromEntries(map));
}

async function getSortedLegs(request: AutoScheduleRequest): Promise<Map<BookingCategory, Array<LegInfo>>> {
  const dateStr = request.date;
  const allLegs = new Map<BookingCategory, Array<LegInfo>>();

  for (const booking of request.bookings) {
    const category = getBookingCategory(booking);
    const leg = await getLegInfo(dateStr, booking);
    // console.log(query)

    if (!allLegs.has(category)) {
      allLegs.set(category, []);
    }
    allLegs.get(category)!.push(leg);
  }

  // Sort queries by departureTime
  for (const category of allLegs.keys()) {
    allLegs.get(category)!.sort((lhs, rhs) => lhs.departureTime.getTime() - rhs.departureTime.getTime());
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

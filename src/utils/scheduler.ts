import { AutoScheduleRequest, Booking } from '../interfaces';
import { getDateByDateTimeAddress } from './time';
import { TripQuery } from './map';

export function getSortedBookingQueries(request: AutoScheduleRequest): Map<BookingCategory, Array<TripQuery>> {
  const dateStr = request.date;
  const queries = new Map<BookingCategory, Array<TripQuery>>();

  for (const booking of request.bookings) {
    const category = getBookingCategory(booking);
    const query = getTripQuery(dateStr, booking);
    // console.log(query)

    if (!queries.has(category)) {
      queries.set(category, []);
    }
    queries.get(category)!.push(query);
  }

  // Sort queries by departureTime
  for (const category of queries.keys()) {
    queries.get(category)!.sort((a, b) => a.departureTime.getTime() - b.departureTime.getTime());
  }

  return queries
}

enum BookingCategory {
  Stretcher = 'STRETCHER',
  Wheelchair = 'WHEELCHAIR',
  Ambulatory = 'AMBULATORY',
}

function getTripQuery(dateStr: string, booking: Booking): TripQuery {
  const departureTime = getDateByDateTimeAddress(dateStr, booking.pickup_time, booking.pickup_address);
  return {
      departureTime,
      pickupAddr: booking.pickup_address,
      dropoffAddr: booking.dropoff_address,
      bookingId: booking.booking_id,
    }
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

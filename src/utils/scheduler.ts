import { AutoScheduleRequest, Booking } from '../interfaces';
import { getDateByDateTimeAddress } from './time'; // Changed import
import { TripQuery } from './map'; // Keep existing import

/**
 * Transforms an AutoScheduleRequest into an array of TripQuery objects.
 * @param request The AutoScheduleRequest object.
 * @returns An array of TripQuery objects.
 * @throws Error if invalid request.
*/
export function getTripQueriesFromAutoScheduleRequest(request: AutoScheduleRequest): TripQuery[] {
  const tripQueries: TripQuery[] = [];
  const requestDateStr = request.date; // e.g., "August 27, 2024"

  for (const booking of request.bookings) {
    const pickupTimeStr = booking.pickup_time;
    const departureTime = getDateByDateTimeAddress(requestDateStr, pickupTimeStr, booking.pickup_address);

    tripQueries.push({
      departureTime,
      pickupAddr: booking.pickup_address,
      dropoffAddr: booking.dropoff_address,
      bookingId: booking.booking_id,
    });
  }

  return tripQueries;
}

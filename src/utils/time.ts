import timezoneMapping from './timezone_mapper.json';

import { toDate, fromZonedTime } from 'date-fns-tz'

interface TimezoneEntry {
  stateCode: string;
  state: string;
  zipcodeStart: number;
  zipcodeEnd: number;
  timezoneId: string;
}

/**
 * Get Date object from date/time/timezone combination.
 * @param dateStr A string to present date like "August 27, 2024".
 * @param timeStr A string to present time in the day like "08:00".
 * @param timezoneId A string to present timezone like "America/Los_Angeles"
 * @returns The Date object in the correct time zone.
 * @throws Error if timezone not found, or date/time parsing fails.
 */
export function getDateTime(dateStr: string, timeStr: string, timezoneId: string): Date {
  // Parse timeStr ("HH:mm")
  let [hoursStr, minutesStr] = timeStr.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  // Combine dateStr and parsed time. dateStr is "Month Day, Year"
  // fromZonedTime expects a string like "YYYY-MM-DDTHH:mm:ss" or a Date object.
  // Let's create a Date object first from dateStr and then set time.
  const baseDate = new Date(dateStr); // e.g., "August 27, 2024"
  if (isNaN(baseDate.getTime())) {
    throw new Error(`Invalid dateStr: "${dateStr}".`);
  }

  // Create a new date object in UTC using parts, then convert from the target timezone
  // This avoids issues with local system timezone affecting intermediate Date objects.
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth(); // 0-indexed
  const day = baseDate.getDate();

  // Construct the date string in ISO-like format for fromZonedTime
  // YYYY-MM-DDTHH:mm:ss
  const isoDateTimeStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

  try {
    const zonedDate = fromZonedTime(isoDateTimeStr, timezoneId);
    if (isNaN(zonedDate.getTime())) {
      throw new Error(`Could not create zoned date for: "${isoDateTimeStr}" in timezone "${timezoneId}".`);
    }
    return zonedDate;
  } catch (e: any) {
    throw new Error(`Error in fromZonedTime for "${isoDateTimeStr}", timezone "${timezoneId}": ${e.message}`);
  }
}


/**
 * Get timezone like "America/Los_Angeles" with look up the zipcode in address.
 * @param address A string to present timezone like address like "17815 Ventura Boulevard, Encino, CA 91316".
 * @returns string with timezone ID like "America/Los_Angeles"
 */
export function getTimezoneByAddress(address: string): string | null {
  // Extract zipcode from address
  const addressParts = address.split(' ');
  let potentialZip = addressParts[addressParts.length - 1];
  let zipcode: number | null = null;

  if (potentialZip && /^\d{5}$/.test(potentialZip)) {
    zipcode = parseInt(potentialZip, 10);
  }

  if (zipcode === null) {
    return null;
  }

  return getTimezoneByZipcode(zipcode);
}


function getTimezoneByZipcode(zipcode: number): string | null {
  const mapping = timezoneMapping as TimezoneEntry[];
  for (const entry of mapping) {
    if (zipcode >= entry.zipcodeStart && zipcode <= entry.zipcodeEnd) {
      return entry.timezoneId;
    }
  }
  return null;
}

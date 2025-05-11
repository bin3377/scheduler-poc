import timezoneMapping from './timezone_mapper.json';

import { toDate, fromZonedTime } from 'date-fns-tz'

interface TimezoneEntry {
  stateCode: string;
  state: string;
  zipcodeStart: number;
  zipcodeEnd: number;
  timezoneId: string;
}

export function getTimeZoneByZipcode(zipcode: number): string {
  const mapping = timezoneMapping as TimezoneEntry[];
  for (const entry of mapping) {
    if (zipcode >= entry.zipcodeStart && zipcode <= entry.zipcodeEnd) {
      return entry.timezoneId;
    }
  }
  return ""; // Return empty string if no timezone is found
}

export function getDateByTimeStringAndZipcode(timeString: string, zipcode: number): Date | null {
  const timezoneId = getTimeZoneByZipcode(zipcode);
  if (!timezoneId) {
    return null;
  }

  const longString = toLongDateString(timeString);
  if (!longString) {
    return null;
  }

  const date = fromZonedTime(longString, timezoneId);
  if (isNaN(+date)) {
    return null;
  }
  return date;
}

function toLongDateString(timeString: string): string | null {
  const match = timeString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null; // Invalid time string format
  }

  const [, monthStr, dayStr, yearStr, hourStr, minuteStr] = match;
  const pMonth = parseInt(monthStr, 10).toLocaleString('en-us', {minimumIntegerDigits: 2});
  const pDay = parseInt(dayStr, 10).toLocaleString('en-us', {minimumIntegerDigits: 2});
  const pYear = (parseInt(yearStr, 10) + 2000).toLocaleString('en-us', {minimumIntegerDigits: 2, useGrouping: false});
  const pHour = parseInt(hourStr, 10).toLocaleString('en-us', {minimumIntegerDigits: 2});
  const pMinute = parseInt(minuteStr, 10).toLocaleString('en-us', {minimumIntegerDigits: 2});

  return `${pYear}-${pMonth}-${pDay}T${pHour}:${pMinute}:00`
}

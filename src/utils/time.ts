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

function parseOffsetString(offsetString: string): number {
  if (offsetString === 'GMT') return 0; // UTC itself
  const match = offsetString.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) {
    throw new Error(`Invalid offset string: ${offsetString}`);
  }
  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);
  return sign * (hours * 3600 + minutes * 60) * 1000;
}

function getOffsetMilliseconds(date: Date, timezoneId: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezoneId,
    timeZoneName: 'longOffset', // e.g., GMT-05:00
  });
  const parts = formatter.formatToParts(date);
  const offsetPart = parts.find(p => p.type === 'timeZoneName');
  if (!offsetPart) {
    throw new Error(`Could not determine offset for ${timezoneId}`);
  }
  return parseOffsetString(offsetPart.value);
}

interface LocalParts {
  year: number;
  month: number; // 1-indexed
  day: number;
  hour: number;
  minute: number;
}

function getLocalParts(date: Date, timezoneId: string): LocalParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezoneId,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const result: Partial<LocalParts> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      result[part.type as keyof LocalParts] = parseInt(part.value, 10);
    }
  }
  return result as LocalParts;
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

export function getDateByTimeStringAndZipcodeX(timeString: string, zipcode: number): Date | null {
  const timezoneId = getTimeZoneByZipcode(zipcode);
  if (!timezoneId) {
    return null;
  }

  const match = timeString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null; // Invalid time string format
  }

  const [, monthStr, dayStr, yearStr, hourStr, minuteStr] = match;
  const pMonth = parseInt(monthStr, 10);      // 1-indexed
  const pDay = parseInt(dayStr, 10);
  const pYearShort = parseInt(yearStr, 10);
  const pHour = parseInt(hourStr, 10);
  const pMinute = parseInt(minuteStr, 10);

  if (isNaN(pMonth) || isNaN(pDay) || isNaN(pYearShort) || isNaN(pHour) || isNaN(pMinute)) {
    return null;
  }

  const pYear = 2000 + pYearShort;
  const pMonth0Idx = pMonth - 1; // For Date.UTC

  if (
    pMonth < 1 || pMonth > 12 || pMonth0Idx < 0 || pMonth0Idx > 11 ||
    pDay < 1 || pDay > 31 ||
    pHour < 0 || pHour > 23 ||
    pMinute < 0 || pMinute > 59
  ) {
    return null; // Basic invalid date/time values
  }

  // Determine standard and daylight offsets for the zone
  // Use fixed dates in the target year to get representative ST and DT offsets
  const jan1ThisYear = new Date(Date.UTC(pYear, 0, 1)); // Jan 1
  const jul1ThisYear = new Date(Date.UTC(pYear, 6, 1)); // Jul 1

  const offsetST = getOffsetMilliseconds(jan1ThisYear, timezoneId);
  const offsetDT = getOffsetMilliseconds(jul1ThisYear, timezoneId);

  const candidates: number[] = []; // UTC timestamps
  // Candidate using Daylight Time offset (typically results in earlier UTC, preferred for ambiguous fall-back)
  if (offsetDT !== offsetST) { // Only add if different, to avoid duplicate checks
      candidates.push(Date.UTC(pYear, pMonth0Idx, pDay, pHour, pMinute) - offsetDT);
  }
  // Candidate using Standard Time offset
  candidates.push(Date.UTC(pYear, pMonth0Idx, pDay, pHour, pMinute) - offsetST);
  
  // Remove duplicate candidate if offsetST === offsetDT
  const uniqueCandidates = [...new Set(candidates)];


  for (const utcCandidate of uniqueCandidates) {
    const dateCandidate = new Date(utcCandidate);
    const localParts = getLocalParts(dateCandidate, timezoneId);

    if (
      localParts.year === pYear &&
      localParts.month === pMonth &&
      localParts.day === pDay &&
      localParts.hour === pHour &&
      localParts.minute === pMinute
    ) {
      return dateCandidate;
    }
  }
  
  // If an exact match wasn't found (e.g. "skipped hour" during spring-forward like 2:30 AM)
  // The problem description doesn't specify behavior. Returning null is safest.
  // The previous implementation might have shifted it.
  // The current tests for spring-forward check 1:59 (valid) and 3:00 (valid), not the skipped hour.
  return null;
}

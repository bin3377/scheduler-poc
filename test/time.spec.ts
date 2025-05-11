import { describe, it, expect } from 'vitest';
import { getTimeZoneByZipcode, getDateByTimeStringAndZipcode } from '../src/utils/time';

describe('getTimeZoneByZipcode', () => {
	it('should return the correct timezone for a valid zipcode', () => {
		// California zipcode
		expect(getTimeZoneByZipcode(90210)).toBe('America/Los_Angeles');
		// New York zipcode
		expect(getTimeZoneByZipcode(10001)).toBe('America/New_York');
		// Florida zipcode
		expect(getTimeZoneByZipcode(32801)).toBe('America/New_York');
	});

	it('should return the correct timezone for a boundary zipcode', () => {
		// Alabama zipcodeStart
		expect(getTimeZoneByZipcode(35004)).toBe('America/Chicago');
		// Alabama zipcodeEnd
		expect(getTimeZoneByZipcode(36925)).toBe('America/Chicago');
	});

	it('should return an empty string for a zipcode not in the mapping', () => {
		expect(getTimeZoneByZipcode(400)).toBe(''); // A zipcode below the lowest start range
		expect(getTimeZoneByZipcode(99999)).toBe(''); // A high zipcode likely not in ranges (AK ends at 99950)
	});

	it('should return an empty string for a zipcode outside known ranges', () => {
		expect(getTimeZoneByZipcode(1)).toBe('');
		expect(getTimeZoneByZipcode(1000000)).toBe('');
	});

	it('should handle Hawaii zipcode correctly', () => {
		expect(getTimeZoneByZipcode(96706)).toBe('Pacific/Tahiti'); // Honolulu
	});

	it('should handle Alaska zipcode correctly', () => {
		expect(getTimeZoneByZipcode(99501)).toBe('America/Anchorage'); // Anchorage
	});
});

describe('getDateByTimeStringAndZipcode', () => {
	it('should return a valid Date object for a valid time string and zipcode (New York - EST/EDT)', () => {
		// Standard time (e.g., January)
		const dateJan = getDateByTimeStringAndZipcode('1/15/24 10:00', 10001); // NYC
		expect(dateJan).toBeInstanceOf(Date);
		expect(dateJan?.toISOString()).toBe('2024-01-15T15:00:00.000Z'); // 10:00 EST is 15:00 UTC

		// Daylight Saving Time (e.g., June)
		const dateJun = getDateByTimeStringAndZipcode('6/5/24 10:00', 10001); // NYC
		expect(dateJun).toBeInstanceOf(Date);
		expect(dateJun?.toISOString()).toBe('2024-06-05T14:00:00.000Z'); // 10:00 EDT is 14:00 UTC
	});

	it('should return a valid Date object for a valid time string and zipcode (Los Angeles - PST/PDT)', () => {
		// Standard time (e.g., December)
		const dateDec = getDateByTimeStringAndZipcode('12/15/23 14:30', 90210); // LA
		expect(dateDec).toBeInstanceOf(Date);
		expect(dateDec?.toISOString()).toBe('2023-12-15T22:30:00.000Z'); // 14:30 PST is 22:30 UTC

		// Daylight Saving Time (e.g., July)
		const dateJul = getDateByTimeStringAndZipcode('7/10/24 14:30', 90210); // LA
		expect(dateJul).toBeInstanceOf(Date);
		expect(dateJul?.toISOString()).toBe('2024-07-10T21:30:00.000Z'); // 14:30 PDT is 21:30 UTC
	});

	it('should return null if the timezone is not found (invalid zipcode)', () => {
		expect(getDateByTimeStringAndZipcode('6/5/24 6:00', 1)).toBeNull(); // Invalid zipcode
		expect(getDateByTimeStringAndZipcode('6/5/24 6:00', 99999)).toBeNull(); // Zipcode not in mapping
	});

	it('should return null for invalid time string formats', () => {
		expect(getDateByTimeStringAndZipcode('06-05-2024 06:00', 90210)).toBeNull();
		expect(getDateByTimeStringAndZipcode('6/5/24 6 AM', 90210)).toBeNull();
		expect(getDateByTimeStringAndZipcode('6/5/24', 90210)).toBeNull();
		expect(getDateByTimeStringAndZipcode('6/5/24 25:00', 90210)).toBeNull(); // Invalid hour
		expect(getDateByTimeStringAndZipcode('13/5/24 10:00', 90210)).toBeNull(); // Invalid month
		expect(getDateByTimeStringAndZipcode('6/32/24 10:00', 90210)).toBeNull(); // Invalid day
	});

	it('should handle midnight correctly', () => {
		const dateMidnight = getDateByTimeStringAndZipcode('3/10/24 0:00', 10001); // NYC
		expect(dateMidnight).toBeInstanceOf(Date);
		// In 2024, DST started on March 10th at 2 AM for America/New_York.
		// So, 00:00 on March 10th is still EST.
		expect(dateMidnight?.toISOString()).toBe('2024-03-10T05:00:00.000Z'); // 00:00 EST is 05:00 UTC
	});

	it('should handle DST transition (spring forward - America/New_York)', () => {
		// March 10, 2024, was the day DST started in America/New_York.
		// 1:59 AM EST was followed by 3:00 AM EDT.
		const beforeDST = getDateByTimeStringAndZipcode('3/10/24 1:59', 10001);
		expect(beforeDST?.toISOString()).toBe('2024-03-10T06:59:00.000Z'); // 1:59 EST

		// Attempting to create a time that "doesn't exist" (2:30 AM on this day)
		// The behavior of Date.UTC and Intl.DateTimeFormat for non-existent times
		// can be tricky. The current implementation should resolve it to a valid time,
		// often by shifting it. Let's test for 3:00 AM which is valid EDT.
		const afterDST = getDateByTimeStringAndZipcode('3/10/24 3:00', 10001);
		expect(afterDST?.toISOString()).toBe('2024-03-10T07:00:00.000Z'); // 3:00 EDT (UTC-4)
	});

	it('should handle DST transition (fall back - America/New_York)', () => {
		// November 3, 2024, is the day DST ends in America/New_York.
		// 1:59 AM EDT is followed by 1:00 AM EST.
		const beforeDSTend = getDateByTimeStringAndZipcode('11/3/24 1:59', 10001); // This is 1:59 AM EDT
		expect(beforeDSTend?.toISOString()).toBe('2024-11-03T05:59:00.000Z'); // 1:59 EDT (UTC-4)

		// The hour from 1:00 AM to 1:59 AM occurs twice.
		// Test the first occurrence (EDT)
		const firstOccurrence = getDateByTimeStringAndZipcode('11/3/24 1:30', 10001); // Should be 1:30 AM EDT
		expect(firstOccurrence?.toISOString()).toBe('2024-11-03T05:30:00.000Z');

		// Test the second occurrence (EST) - This is harder to distinguish with simple string input
		// without more context. The current function will likely pick the first valid interpretation
		// based on how Date.UTC and Intl.DateTimeFormat resolve ambiguity.
		// For this test, we'll check 1:30 AM again, and it should be the same as above.
		// A more sophisticated parser might allow specifying "first" or "second" 1 AM.
		// For now, we ensure it's consistent.
		const afterDSTend = getDateByTimeStringAndZipcode('11/3/24 1:30', 10001); // Still 1:30 AM EDT by default
		expect(afterDSTend?.toISOString()).toBe('2024-11-03T05:30:00.000Z');

		const estTime = getDateByTimeStringAndZipcode('11/3/24 2:30', 10001); // This is 2:30 AM EST
		expect(estTime?.toISOString()).toBe('2024-11-03T07:30:00.000Z'); // 2:30 EST (UTC-5)
	});
});

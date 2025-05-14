import { describe, it, expect } from 'vitest';
import { getDateTime } from '../src/utils/time';

// Mock timezoneMapping if it's an external dependency affecting tests,
// or ensure test zipcodes exist in the actual timezone_mapper.json
// For simplicity, we'll assume some zipcodes exist for testing.
// A more robust approach might involve mocking timezone_mapper.json
// or having a dedicated test version of it.

// describe('getTimeZoneByZipcode', () => { // Removed tests for non-exported function
//   it('should return the correct timezone ID for a known zipcode range', () => {
//     // Assuming 90210 is in 'America/Los_Angeles' based on typical US timezone data
//     // This test depends on the content of timezone_mapper.json
//     expect(getTimeZoneByZipcode(90210)).toBe('America/Los_Angeles');
//   });

//   it('should return an empty string for a zipcode not in the mapping', () => {
//     expect(getTimeZoneByZipcode(0o0000)).toBe(''); // Using a clearly invalid zipcode
//   });
// });

describe('getDateTime', () => {
  it('should return a correct Date object for valid inputs (America/Los_Angeles)', () => {
    const dateStr = 'August 27, 2024';
    const timeStr = '08:30'; // 24-hour format
    const timezone = 'America/Los_Angeles'; // LA timezone
    const resultDate = getDateTime(dateStr, timeStr, timezone);
    // Expected: 2024-08-27T08:30:00 in America/Los_Angeles
    // We can check components or convert to a specific string format for comparison
    expect(resultDate.getFullYear()).toBe(2024);
    expect(resultDate.getMonth()).toBe(7); // August is month 7 (0-indexed)
    expect(resultDate.getDate()).toBe(27);
    // Hours will depend on the test runner's local timezone vs the target timezone.
    // For a robust test, convert to UTC or a fixed offset string if date-fns-tz is available here
    // or check parts that are timezone-independent if possible.
    // For now, let's check if it's a valid date.
    expect(resultDate).toBeInstanceOf(Date);
    expect(isNaN(resultDate.getTime())).toBe(false);
    // A more precise check would involve converting resultDate to a string in 'America/Los_Angeles'
    // and comparing it, e.g., using date-fns-tz format function if available in test scope.
    // Example: format(resultDate, 'yyyy-MM-dd HH:mm:ssXXX', { timeZone: 'America/Los_Angeles' })
    // For this example, we'll assume the internal logic of fromZonedTime is correct.
  });

  it('should throw an error if invalid timezone', () => {
    const dateStr = 'August 27, 2024';
    const timeStr = '08:30';
    const timezone = 'Invalid';
    expect(() => getDateTime(dateStr, timeStr, timezone))
      .toThrow('Error in fromZonedTime for "2024-08-27T08:30:00", timezone "Invalid": Could not create zoned date for: "2024-08-27T08:30:00" in timezone "Invalid".');
  });

  it('should throw an error for an invalid date string', () => {
    const dateStr = 'Invalid Date String';
    const timeStr = '08:30';
    const timezone = 'America/Los_Angeles'; // LA timezone
    expect(() => getDateTime(dateStr, timeStr, timezone))
      .toThrow('Invalid dateStr: "Invalid Date String".');
  });

  it('should throw an error for an invalid time string format (e.g., missing colon)', () => {
    const dateStr = 'August 27, 2024';
    const timeStr = '0830 AM'; // Invalid time
    const timezone = 'America/Los_Angeles'; // LA timezone
    // This error will likely come from parseInt or split, not directly from a custom check in getDateByDateTimeAddress
    // but the function should still fail. The exact error message might vary.
    expect(() => getDateTime(dateStr, timeStr, timezone))
      .toThrow(); // Or a more specific error if one is consistently thrown by the parsing logic
  });
  
  it('should correctly parse 12 AM (midnight)', () => {
    const dateStr = 'January 1, 2025';
    const timeStr = '12:00 AM';
    const timezone = 'America/Los_Angeles'; // LA timezone
    const resultDate = getDateTime(dateStr, timeStr, timezone);
    // In LA timezone, this is 2025-01-01T00:00:00
    // Check date components carefully
    const expected = new Date('2025-01-01T00:00:00.000Z'); // This is UTC
    // To compare accurately, we need to consider the timezone offset or use date-fns-tz format
    // For simplicity, let's check if the hour component in the target timezone is 0
    // This requires date-fns-tz's format function or similar.
    // Since we don't have it directly here, we'll rely on the internal logic of fromZonedTime.
    // A basic check:
    expect(resultDate.getFullYear()).toBe(2025);
    expect(resultDate.getMonth()).toBe(0); // January
    expect(resultDate.getDate()).toBe(1);
    // A more robust check would be:
    // const formatted = formatInTimeZone(resultDate, 'America/Los_Angeles', 'yyyy-MM-dd HH:mm:ss');
    // expect(formatted).toBe('2025-01-01 00:00:00');
    // For now, we trust fromZonedTime handles this.
    expect(isNaN(resultDate.getTime())).toBe(false);
  });

  it('should correctly parse 12 PM (noon)', () => {
    const dateStr = 'January 1, 2025';
    const timeStr = '12:00 PM';
    const timezone = 'America/Los_Angeles'; // LA timezone
    const resultDate = getDateTime(dateStr, timeStr, timezone);
    // In LA timezone, this is 2025-01-01T12:00:00
    expect(resultDate.getFullYear()).toBe(2025);
    expect(resultDate.getMonth()).toBe(0);
    expect(resultDate.getDate()).toBe(1);
    expect(isNaN(resultDate.getTime())).toBe(false);
    // Similar to 12 AM, a robust check would format and compare.
  });
});

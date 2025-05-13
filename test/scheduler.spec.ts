import { describe, it, expect, vi } from 'vitest'

declare global {
  var currentEnv: {
    API_TOKEN: string
    DEBUG_MODE: boolean
    DEFAULT_BEFORE_PICKUP_TIME: number
    DEFAULT_AFTER_PICKUP_TIME: number
    DEFAULT_PICKUP_LOADING_TIME: number
    DEFAULT_DROPOFF_UNLOADING_TIME: number
  }
}
import { getLegInfo, type LegInfo } from '../src/utils/scheduler'
import type { Booking } from '../src/interfaces'
import { GetDirection } from '../src/utils/map'

// Mock environment variables
globalThis.currentEnv = {
  API_TOKEN: 'test-api-key',
  DEBUG_MODE: false,
  DEFAULT_BEFORE_PICKUP_TIME: 300,
  DEFAULT_AFTER_PICKUP_TIME: 300,
  DEFAULT_PICKUP_LOADING_TIME: 60,
  DEFAULT_DROPOFF_UNLOADING_TIME: 60
}

// Mock GetDirection function
vi.mock('../src/utils/map', () => ({
  GetDirection: vi.fn().mockResolvedValue([1000, 300]) // distanceInMeter, durationInSec
}))

describe('getLegInfo', () => {
  const mockBooking: Booking = {
    // TripMetadata fields
    trip_id: 't001',
    program_id: 'prog1',
    program_name: 'Test Program',
    program_timezone: 'America/Los_Angeles',
    
    // Booking fields
    booking_id: '12345',
    passenger_id: 'p001',
    passenger_firstname: 'John',
    passenger_lastname: 'Doe',
    passenger_phone: '555-1234',
    additional_passenger: 0,
    pickup_address_id: 'addr1',
    pickup_address: '123 Main St, San Francisco, CA 94105',
    pickup_latitude: 37.7749,
    pickup_longitude: -122.4194,
    pickup_time: '10:00',
    dropoff_address_id: 'addr2',
    dropoff_address: '456 Oak St, San Francisco, CA 94107',
    dropoff_latitude: 37.7750,
    dropoff_longitude: -122.4184,
    mobility_assistance: ['Wheelchair'],
    
    // Other required fields with defaults
    pickup_account_id: null,
    dropoff_account_id: null,
    scheduled_pickup_time: null,
    scheduled_dropoff_time: null,
    actual_pickup_time: null,
    actual_dropoff_time: null,
    driver_arrival_time: null,
    driver_enroute_time: null,
    travel_time: 0,
    travel_distance: 0,
    ride_status: 0,
    ride_fee: 0,
    total_addl_fee_usd_cents: 0,
    payment: 'cash',
    insurance_account_id: null,
    payment_complete: false,
    admin_note: null,
    trip_complete: false,
    driver_note: null,
    office_note: null,
    flag: false,
    willcall_call_time: null,
    total_seat_count: 1
  }

  it('should return a valid LegInfo object with wheelchair assistance', async () => {
    const result = await getLegInfo('2025-05-12', mockBooking)
    
    expect(result).toHaveProperty('bookingId', '12345')
    expect(result).toHaveProperty('pessagner', 'John Doe')
    expect(result).toHaveProperty('mobilityAssistance')
    expect(result.mobilityAssistance).toContain('Wheelchair')
    expect(result).toHaveProperty('fromAddr', '123 Main St, San Francisco, CA 94105')
    expect(result).toHaveProperty('toAddr', '456 Oak St, San Francisco, CA 94107')
    expect(result.distanceInMeter).toBeDefined()
    expect(result.durationInSec).toBeDefined()
  })

  it('should handle stretcher assistance type', async () => {
    const stretcherBooking = {
      ...mockBooking,
      mobility_assistance: ['Stretcher']
    }
    const result = await getLegInfo('2025-05-12', stretcherBooking)
    expect(result.priority).toBe('Stretcher')
  })

  it('should handle ambulatory assistance type', async () => {
    const ambulatoryBooking = {
      ...mockBooking,
      mobility_assistance: []
    }
    const result = await getLegInfo('2025-05-12', ambulatoryBooking)
    expect(result.priority).toBe('Ambulatory')
  })

  it('should handle multiple assistance types', async () => {
    const multiBooking = {
      ...mockBooking,
      mobility_assistance: ['Wheelchair', 'Stretcher']
    }
    const result = await getLegInfo('2025-05-12', multiBooking)
    expect(result.mobilityAssistance).toContain('Wheelchair')
    expect(result.mobilityAssistance).toContain('Stretcher')
    expect(result.priority).toBe('Stretcher')
  })

  it('should handle invalid date string', async () => {
    await expect(getLegInfo('invalid-date', mockBooking))
      .rejects.toThrow()
  })

  it('should handle missing required booking fields', async () => {
    const invalidBooking = { ...mockBooking, pickup_address: '' }
    await expect(getLegInfo('2025-05-12', invalidBooking))
      .rejects.toThrow()
  })
})

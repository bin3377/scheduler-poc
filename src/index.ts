/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { GetTrip } from '../src/utils/map';
import { AutoScheduleRequest } from './interfaces'; // Added import

// Basic validation function for AutoScheduleRequest
function isValidAutoScheduleRequest(data: any): data is AutoScheduleRequest {
	if (!data || typeof data !== 'object') {
		return false;
	}
	const { date, bookings, before_pickup_time, after_pickup_time, pickup_loading_time, dropoff_unloading_time } = data;
	if (typeof date !== 'string' || !Array.isArray(bookings)) {
		return false;
	}
	// Add more specific checks for bookings array elements and other properties if needed
	if (
		(before_pickup_time !== null && typeof before_pickup_time !== 'number') ||
		(after_pickup_time !== null && typeof after_pickup_time !== 'number') ||
		(pickup_loading_time !== null && typeof pickup_loading_time !== 'number') ||
		(dropoff_unloading_time !== null && typeof dropoff_unloading_time !== 'number')
	) {
		return false;
	}
	if (!bookings.every(isValidBooking)) {
		return false;
	}
	return true;
}

function isValidBooking(booking: any): boolean {
	// Basic check, can be expanded
	return booking && typeof booking.booking_id === 'string' && typeof booking.pickup_address === 'string' && typeof booking.dropoff_address === 'string';
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		switch(path) {
			case '/v1_webapp_auto_scheduling':
				return await autoSchedule(request, env, ctx);
			case '/':
				return await root(request, env, ctx);
			default:
				return new Response('Not Found', { status: 404 });
		}
	},
} satisfies ExportedHandler<Env>;

async function root(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	console.log('Handling / path');
	const q = {
		departureTime: new Date(),
		pickupAddr: '9701 Medical Center Drive Rockville 20850',
		dropoffAddr: '15204 Omega Drive Rockville 20850',
	};

	try {
		const trip = await GetTrip(q, env);
		const options = {
			headers: { 'content-type': 'application/json;charset=UTF-8' },
		};
		return new Response(JSON.stringify(trip), options);
	} catch (error) {
		console.error('Error in GetTrip:', error);
		return new Response(JSON.stringify({ error: 'Failed to get trip data' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

async function autoSchedule(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method Not Allowed', { status: 405 });
	}

	try {
		const jsonData: unknown = await request.json();

		if (!isValidAutoScheduleRequest(jsonData)) {
			return new Response(JSON.stringify({ error: 'Invalid request payload' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// At this point, jsonData is validated as AutoScheduleRequest
		// Process the valid request (e.g., save to DB, trigger scheduling logic)
		console.log('Received valid AutoScheduleRequest:', jsonData);

		return new Response(JSON.stringify({ message: 'Request received and validated successfully' }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		if (error instanceof SyntaxError) {
			return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		console.error('Error processing request:', error);
		return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}
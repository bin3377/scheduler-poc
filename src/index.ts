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

export default {

  async fetch(request, env, ctx) {
		const url = new URL(request.url);
		let uri = url.pathname;
		console.log(uri);

		const q = {
			departureTime: new Date(),
			pickupAddr: '9701 Medical Center Drive Rockville 20850',
			dropoffAddr: '15204 Omega Drive Rockville 20850',
  	};

		const trip = await GetTrip(q, env)

		const options = {
      headers: { "content-type": "application/json;charset=UTF-8" },
    };
    return new Response(JSON.stringify(trip), options);
  },

	// async fetch(request, env, ctx): Promise<Response> {
	// 	return new Response('Hello World!');
	// },
} satisfies ExportedHandler<Env>;

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

import { DoSchedule } from '../src/utils/scheduler'
import { AutoSchedulingRequest, AutoSchedulingResponse } from './interfaces'; // Added import

declare global {
  var currentEnv: Env;
	var currentCtx: ExecutionContext;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		globalThis.currentEnv = env
		globalThis.currentCtx = ctx

		const url = new URL(request.url);
		const path = url.pathname;

		switch (path) {
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

	try {
		const options = {
			headers: { 'content-type': 'application/json;charset=UTF-8' },
		};
		return new Response(JSON.stringify(null), options);
	} catch (error) {
		return new Response(JSON.stringify("failed"), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

async function autoSchedule(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
	if (env.ENABLE_ORIGIN_CHECK) {
		const origin = request.headers.get('Origin');
		// Cast to readonly string[] to satisfy TypeScript when using .includes with a general string
		if (!origin || !(env.ACCEPTABLE_ORIGINS as readonly string[]).includes(origin)) {
			return new Response(JSON.stringify({ error: 'Forbidden - Invalid origin' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	}

	if (request.method !== 'POST') {
		return new Response('Method Not Allowed', { status: 405 });
	}

	try {
		const jsonData: unknown = await request.json();
		const rspn = await DoSchedule(jsonData as AutoSchedulingRequest)

		if (typeof rspn === 'string') {
			return new Response(rspn, {
				status: 200,
			})
		} else {
			return new Response(JSON.stringify(rspn), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

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

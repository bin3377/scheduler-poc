declare module 'cloudflare:test' {
	interface ProvidedEnv extends Env {}
}

// Make sure Env is available globally if not already
// This might be redundant if worker-configuration.d.ts already does this effectively
// interface Env extends Cloudflare.Env {} 

declare global {
	namespace globalThis {
		var currentEnv: Env;
		var currentCtx: ExecutionContext;
		var fetch: typeof fetch; // Ensure fetch is recognized on globalThis for mocking
	}
}

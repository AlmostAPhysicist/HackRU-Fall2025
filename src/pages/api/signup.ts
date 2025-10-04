/**
 * /api/signup
 * Astro API route that registers new accounts and persists them to the demo data store.
 */

import type { APIRoute } from 'astro';
import { routes } from '../../server/index';

export const prerender = false;

const jsonHeaders = { 'content-type': 'application/json' } as const;

export const POST: APIRoute = async ({ request }) => {
	return routes.signup(request);
};

export const GET: APIRoute = async () =>
	new Response(
		JSON.stringify({ error: 'Method not allowed. Submit credentials with a POST request.' }),
		{
			status: 405,
			headers: jsonHeaders,
		},
	);

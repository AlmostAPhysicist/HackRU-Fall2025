/**
 * /api/dashboard/buyer
 * Returns personalized dashboard data for a buyer user.
 */

import type { APIRoute } from 'astro';
import { buildBuyerDashboard } from '../../../server/dashboard-service';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
	const userId = url.searchParams.get('userId');
	if (!userId) {
		return new Response(JSON.stringify({ error: 'Missing userId parameter.' }), {
			status: 400,
			headers: { 'content-type': 'application/json' },
		});
	}

	const dashboard = await buildBuyerDashboard(userId);
	if (!dashboard) {
		return new Response(JSON.stringify({ error: 'No dashboard data found for that user.' }), {
			status: 404,
			headers: { 'content-type': 'application/json' },
		});
	}

	return new Response(JSON.stringify(dashboard), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
};

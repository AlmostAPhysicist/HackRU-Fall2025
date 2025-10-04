/**
 * /api/buyer/inventory
 * Adds a new inventory item to the buyer profile and returns the updated dashboard payload.
 */

import type { APIRoute } from 'astro';
import { addBuyerInventory, buildBuyerDashboard } from '../../../server/dashboard-service';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json();
		const userId = String(body.userId ?? '').trim();
		const name = String(body.name ?? '').trim();
		const quantity = Number(body.quantity ?? 0);
		const unit = String(body.unit ?? '').trim();
		const category = String(body.category ?? '').trim() || 'Pantry';
		const expirationDate = body.expirationDate ? String(body.expirationDate) : undefined;
		const estimatedValue = body.estimatedValue ? Number(body.estimatedValue) : undefined;

		if (!userId || !name || !unit || Number.isNaN(quantity) || quantity <= 0) {
			return new Response(JSON.stringify({ error: 'Invalid payload. Provide userId, name, unit, and quantity.' }), {
				status: 400,
				headers: { 'content-type': 'application/json' },
			});
		}

		await addBuyerInventory({ userId, name, quantity, unit, category, expirationDate, estimatedValue });
		const dashboard = await buildBuyerDashboard(userId);
		return new Response(JSON.stringify(dashboard), {
			status: 201,
			headers: { 'content-type': 'application/json' },
		});
	} catch (error) {
		console.error('[api/buyer/inventory] failed', error);
		return new Response(JSON.stringify({ error: 'Unable to update inventory right now.' }), {
			status: 500,
			headers: { 'content-type': 'application/json' },
		});
	}
};

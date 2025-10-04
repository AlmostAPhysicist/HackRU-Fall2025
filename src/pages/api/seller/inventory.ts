/**
 * /api/seller/inventory
 * Adds a new inventory entry for a seller and returns the updated dashboard payload.
 */

import type { APIRoute } from 'astro';
import { addSellerInventory, buildSellerDashboard } from '../../../server/dashboard-service';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	try {
		const body = await request.json();
		const userId = String(body.userId ?? '').trim();
		const sku = String(body.sku ?? '').trim() || `sku-${crypto.randomUUID().slice(0, 6)}`;
		const name = String(body.name ?? '').trim();
		const category = String(body.category ?? '').trim() || 'General';
		const stock = Number(body.stock ?? 0);
		const parLevel = Number(body.parLevel ?? 0);
		const daysOnHand = Number(body.daysOnHand ?? 0);
		const margin = Number(body.margin ?? 0.2);

		if (!userId || !name || Number.isNaN(stock) || stock <= 0) {
			return new Response(JSON.stringify({ error: 'Invalid payload. Provide userId, name, stock, and supporting details.' }), {
				status: 400,
				headers: { 'content-type': 'application/json' },
			});
		}

		await addSellerInventory(userId, { sku, name, category, stock, parLevel, daysOnHand, margin });
		const dashboard = await buildSellerDashboard(userId);
		return new Response(JSON.stringify(dashboard), {
			status: 201,
			headers: { 'content-type': 'application/json' },
		});
	} catch (error) {
		console.error('[api/seller/inventory] failed', error);
		return new Response(JSON.stringify({ error: 'Unable to update seller inventory right now.' }), {
			status: 500,
			headers: { 'content-type': 'application/json' },
		});
	}
};

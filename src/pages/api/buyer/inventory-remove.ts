import type { APIRoute } from 'astro';
import { removeBuyerInventoryItem } from '../../../server/profile-store';
import { buildBuyerDashboard } from '../../../server/dashboard-service';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const userId = String(body.userId ?? '').trim();
    const inventoryId = String(body.inventoryId ?? '').trim();

    if (!userId || !inventoryId) {
      return new Response(JSON.stringify({ error: 'Provide userId and inventoryId.' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    await removeBuyerInventoryItem(userId, inventoryId);
    const dashboard = await buildBuyerDashboard(userId);
    return new Response(JSON.stringify(dashboard), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    console.error('[api/buyer/inventory-remove] failed', err);
    return new Response(JSON.stringify({ error: 'Unable to remove inventory item.' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};

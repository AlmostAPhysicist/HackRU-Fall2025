import type { APIRoute } from 'astro';
import { getBuyerProfile, upsertBuyerProfile } from '../../../server/profile-store';
import { buildBuyerDashboard } from '../../../server/dashboard-service';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const userId = String(body.userId ?? '').trim();
    const item = String(body.item ?? '').trim();
    const quantity = body.quantity ? Number(body.quantity) : 1;
    const unit = String(body.unit ?? 'each').trim();

    if (!userId || !item) {
      return new Response(JSON.stringify({ error: 'Provide userId and item.' }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    const profile = await getBuyerProfile(userId);
    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found.' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }

    // Find an event to attach the quick item: prefer needs-shopping or draft
    let event = profile.events.find((e) => e.status === 'needs-shopping' || e.status === 'draft');
    if (!event) {
      const now = new Date();
      const id = `event-quick-${now.getTime()}`;
      event = {
        id,
        name: 'Quick Order',
        date: now.toISOString().slice(0, 10),
        headcount: 1,
        menu: [],
        status: 'needs-shopping',
        shoppingList: [],
      };
      profile.events = profile.events.concat(event);
    }

    event.shoppingList = event.shoppingList || [];
    event.shoppingList.push({ name: item, quantity: quantity || 1, unit: unit || 'each', status: 'add' });
    profile.lastUpdated = new Date().toISOString().slice(0, 10);

    await upsertBuyerProfile(profile);

    const dashboard = await buildBuyerDashboard(userId);
    return new Response(JSON.stringify(dashboard), { status: 201, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    console.error('[api/buyer/ai-add-to-list] failed', err);
    return new Response(JSON.stringify({ error: 'Unable to add suggestion to list.' }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};

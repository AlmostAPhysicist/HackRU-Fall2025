import { generateBuyerAiInsights, generateSellerAiInsights } from './ai';
import {
	appendBuyerInventoryItem,
	addSellerInventoryEntry,
	ensureBuyerProfileForUser,
	ensureSellerProfileForUser,
	getBuyerProfile,
	getSellerProfile,
	listOffersForZip,
} from './profile-store';
import type {
	BuyerDashboardData,
	BuyerDashboardMetrics,
	BuyerInventoryInput,
	BuyerProfile,
	SellerDashboardData,
	SellerDashboardMetrics,
	SellerProfile,
} from './types';

function clampScore(value: number): number {
	return Math.max(0, Math.min(100, Math.round(value)));
}

function computeBuyerMetrics(profile: BuyerProfile): BuyerDashboardMetrics {
	const total = profile.inventory.length;
	const expiring = profile.inventory.filter((item) => item.status === 'use-soon').length;
	const healthy = profile.inventory.filter((item) => item.status === 'healthy').length;
	const restock = profile.inventory.filter((item) => item.status === 'restock').length;

	const wasteRisk = clampScore(100 - expiring * 18);
	const pantryHealth = total === 0 ? 0 : clampScore((healthy / total) * 100 - restock * 5);

	const recentSpend = profile.purchases.slice(0, 4).reduce((sum, purchase) => sum + purchase.total, 0);
	const budgetHealth = clampScore(100 - ((recentSpend - profile.budgetPerWeek) / profile.budgetPerWeek) * 40);

	const readyEvents = profile.events.filter((event) => event.status === 'on-track').length;
	const eventReadiness = profile.events.length === 0 ? 50 : clampScore((readyEvents / profile.events.length) * 100);

	return { wasteRisk, pantryHealth, budgetHealth, eventReadiness };
}

function computeSellerMetrics(profile: SellerProfile): SellerDashboardMetrics {
	const risky = profile.inventory.filter((item) => item.status !== 'healthy');
	const total = profile.inventory.length || 1;
	const sellThrough = clampScore((1 - risky.length / total) * 100);

	const spoilageRisk = clampScore(
		risky.reduce((score, item) => score + item.spoilageRisk, 0) / Math.max(1, risky.length) || 20,
	);

	const promotionMomentum = clampScore(
		profile.promotions.filter((promo) => promo.status !== 'draft').length * 25 + profile.goals.growBundles,
	);

	const demandConfidence = clampScore(
		profile.demandSignals.reduce((sum, signal) => sum + signal.expectedLift * 100, 0) /
			Math.max(1, profile.demandSignals.length),
	);

	return { sellThrough, spoilageRisk, promotionMomentum, demandConfidence };
}

function deriveShoppingFocus(profile: BuyerProfile): string[] {
	const focus = new Set<string>();
	for (const event of profile.events) {
		for (const item of event.shoppingList) {
			if (item.status !== 'covered') {
				focus.add(`${item.name} • ${item.quantity} ${item.unit}`);
			}
		}
	}
	return Array.from(focus).slice(0, 6);
}

export async function buildBuyerDashboard(userId: string): Promise<BuyerDashboardData | null> {
	const profile = await getBuyerProfile(userId);
	if (!profile) {
		return null;
	}

	const offers = await listOffersForZip(profile.zip);
	const metrics = computeBuyerMetrics(profile);
	const ai = await generateBuyerAiInsights(profile, offers);

	return {
		profile,
		metrics,
		ai,
		offers,
		emptyInventory: profile.inventory.length === 0,
		shoppingFocus: deriveShoppingFocus(profile),
	};
}

export async function buildSellerDashboard(userId: string): Promise<SellerDashboardData | null> {
	const profile = await getSellerProfile(userId);
	if (!profile) {
		return null;
	}

	const offers = await listOffersForZip(profile.store.zip);
	const metrics = computeSellerMetrics(profile);
	const ai = await generateSellerAiInsights(profile, offers);

	return {
		profile,
		metrics,
		ai,
		offers,
		emptyInventory: profile.inventory.length === 0,
	};
}

export async function addBuyerInventory(input: BuyerInventoryInput) {
	return appendBuyerInventoryItem(input);
}

export async function addSellerInventory(
	userId: string,
	item: Omit<SellerProfile['inventory'][number], 'status' | 'spoilageRisk'> & { spoilageRisk?: number },
) {
	return addSellerInventoryEntry(userId, item);
}

export { ensureBuyerProfileForUser, ensureSellerProfileForUser };

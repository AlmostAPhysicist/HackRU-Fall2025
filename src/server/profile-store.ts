import { readFile, writeFile } from 'node:fs/promises';
import { differenceInDays } from './utils/date';
import type { BuyerInventoryInput, BuyerProfile, SellerProfile, StoreOffer } from './types';

interface BuyerProfileDocument {
	profiles: BuyerProfile[];
}

interface SellerProfileDocument {
	profiles: SellerProfile[];
}

const BUYER_FILE = new URL('./data/buyer-profiles.json', import.meta.url);
const SELLER_FILE = new URL('./data/seller-profiles.json', import.meta.url);
const OFFERS_FILE = new URL('./data/store-offers.json', import.meta.url);

async function readBuyerProfiles(): Promise<BuyerProfile[]> {
	try {
		const data = await readFile(BUYER_FILE, 'utf-8');
		const parsed = JSON.parse(data) as BuyerProfileDocument;
		return parsed.profiles ?? [];
	} catch (error) {
		console.error('[profile-store] Unable to read buyer profiles', error);
		return [];
	}
}

async function writeBuyerProfiles(profiles: BuyerProfile[]): Promise<void> {
	const document: BuyerProfileDocument = { profiles };
	try {
		await writeFile(BUYER_FILE, JSON.stringify(document, null, 2), 'utf-8');
	} catch (err) {
		console.warn('[profile-store] Warning: unable to persist buyer profiles (read-only environment?). Changes will not survive restarts.', BUYER_FILE.href, err ? (err as any).message ?? err : err);
	}
}

async function readSellerProfiles(): Promise<SellerProfile[]> {
	try {
		const data = await readFile(SELLER_FILE, 'utf-8');
		const parsed = JSON.parse(data) as SellerProfileDocument;
		return parsed.profiles ?? [];
	} catch (error) {
		console.error('[profile-store] Unable to read seller profiles', error);
		return [];
	}
}

async function writeSellerProfiles(profiles: SellerProfile[]): Promise<void> {
	const document: SellerProfileDocument = { profiles };
	try {
		await writeFile(SELLER_FILE, JSON.stringify(document, null, 2), 'utf-8');
	} catch (err) {
		console.warn('[profile-store] Warning: unable to persist seller profiles (read-only environment?). Changes will not survive restarts.', SELLER_FILE.href, err ? (err as any).message ?? err : err);
	}
}

export async function getBuyerProfile(userId: string): Promise<BuyerProfile | undefined> {
	const profiles = await readBuyerProfiles();
	return profiles.find((profile) => profile.userId === userId);
}

export async function upsertBuyerProfile(profile: BuyerProfile): Promise<BuyerProfile> {
	const profiles = await readBuyerProfiles();
	const index = profiles.findIndex((existing) => existing.userId === profile.userId);
	if (index >= 0) {
		profiles[index] = profile;
	} else {
		profiles.push(profile);
	}
	await writeBuyerProfiles(profiles);
	return profile;
}

function deriveStatus(daysLeft?: number, quantity?: number): BuyerProfile['inventory'][number]['status'] {
	if (typeof daysLeft === 'number' && daysLeft <= 3) {
		return 'use-soon';
	}
	if ((quantity ?? 0) <= 0.5) {
		return 'restock';
	}
	if (typeof daysLeft === 'number' && daysLeft > 40) {
		return 'overflow';
	}
	return 'healthy';
}

export async function appendBuyerInventoryItem(input: BuyerInventoryInput) {
	const profile = await getBuyerProfile(input.userId);
	if (!profile) {
		throw new Error('Profile not found for buyer');
	}

	const today = new Date();
	let daysLeft: number | undefined;
	if (input.expirationDate) {
		daysLeft = Math.max(0, differenceInDays(new Date(input.expirationDate), today));
	}

	const newItem = {
		id: `inv-${crypto.randomUUID()}`,
		name: input.name,
		quantity: input.quantity,
		unit: input.unit,
		category: input.category,
		status: deriveStatus(daysLeft, input.quantity),
		addedOn: today.toISOString().slice(0, 10),
		expirationDate: input.expirationDate,
		daysLeft,
		estimatedValue: input.estimatedValue,
	};

	const updatedProfile: BuyerProfile = {
		...profile,
		inventory: [...profile.inventory, newItem],
		lastUpdated: today.toISOString().slice(0, 10),
	};

	await upsertBuyerProfile(updatedProfile);
	return updatedProfile;
}

export async function removeBuyerInventoryItem(userId: string, inventoryId: string) {
	const profile = await getBuyerProfile(userId);
 	if (!profile) {
 		throw new Error('Profile not found for buyer');
 	}

 	const updatedInventory = profile.inventory.filter((it) => it.id !== inventoryId);
 	const updatedProfile: BuyerProfile = {
 		...profile,
 		inventory: updatedInventory,
 		lastUpdated: new Date().toISOString().slice(0, 10),
 	};

 	await upsertBuyerProfile(updatedProfile);
 	return updatedProfile;
}

export async function ensureBuyerProfileForUser(userId: string, displayName: string): Promise<BuyerProfile> {
	const existing = await getBuyerProfile(userId);
	if (existing) {
		return existing;
	}

	const scaffold: BuyerProfile = {
		userId,
		displayName,
		zip: '07030',
		householdSize: 1,
		dietaryPreferences: ['balanced'],
		activityLevel: 'moderate',
		budgetPerWeek: 90,
		calorieTarget: 2000,
		goals: {
			reduceWaste: 60,
			saveBudget: 60,
			eatHealthy: 60,
		},
		inventory: [],
		purchases: [],
		events: [],
		lastUpdated: new Date().toISOString().slice(0, 10),
	};

	await upsertBuyerProfile(scaffold);
	return scaffold;
}

export async function getSellerProfile(userId: string): Promise<SellerProfile | undefined> {
	const profiles = await readSellerProfiles();
	return profiles.find((profile) => profile.userId === userId);
}

export async function upsertSellerProfile(profile: SellerProfile): Promise<SellerProfile> {
	const profiles = await readSellerProfiles();
	const index = profiles.findIndex((existing) => existing.userId === profile.userId);
	if (index >= 0) {
		profiles[index] = profile;
	} else {
		profiles.push(profile);
	}
	await writeSellerProfiles(profiles);
	return profile;
}

export async function ensureSellerProfileForUser(userId: string, displayName: string): Promise<SellerProfile> {
	const existing = await getSellerProfile(userId);
	if (existing) {
		return existing;
	}

	const scaffold: SellerProfile = {
		userId,
		displayName,
		store: {
			name: `${displayName}'s Market`,
			zip: '07030',
			region: 'Hudson County',
			format: 'market',
		},
		goals: {
			reduceSpoilage: 60,
			increaseSellThrough: 60,
			growBundles: 60,
		},
		inventory: [],
		demandSignals: [],
		promotions: [],
		nearbyBuyerInsights: [],
		salesPerformance: [],
		lastUpdated: new Date().toISOString().slice(0, 10),
	};

	await upsertSellerProfile(scaffold);
	return scaffold;
}

export async function listOffersForZip(zip: string): Promise<StoreOffer[]> {
	try {
		const data = await readFile(OFFERS_FILE, 'utf-8');
		const offers = JSON.parse(data) as StoreOffer[];
		return offers.filter((offer) => offer.zip === zip);
	} catch (error) {
		console.error('[profile-store] Unable to read offers', error);
		return [];
	}
}

export async function addSellerInventoryEntry(userId: string, item: Omit<SellerProfile['inventory'][number], 'status' | 'spoilageRisk'> & { spoilageRisk?: number }) {
	const profile = await getSellerProfile(userId);
	if (!profile) {
		throw new Error('Profile not found for seller');
	}

	const computedRisk = item.daysOnHand > 14 ? 70 : item.daysOnHand > 9 ? 40 : 20;
	const status: SellerProfile['inventory'][number]['status'] = computedRisk > 65 ? 'critical' : computedRisk > 40 ? 'risk' : 'healthy';

	const newEntry = {
		...item,
		status,
		spoilageRisk: item.spoilageRisk ?? computedRisk,
	};

	const updatedProfile: SellerProfile = {
		...profile,
		inventory: [...profile.inventory, newEntry],
		lastUpdated: new Date().toISOString().slice(0, 10),
	};

	await upsertSellerProfile(updatedProfile);
	return updatedProfile;
}

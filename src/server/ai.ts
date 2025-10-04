import type {
	BuyerAiInsights,
	BuyerProfile,
	SellerAiInsights,
	SellerProfile,
	StoreOffer,
} from './types';

const AI_ENDPOINT = process.env.AI_API_URL ?? 'https://api.openai.com/v1/responses';
const AI_MODEL = process.env.AI_MODEL ?? 'gpt-4.1-mini';

async function callAi(prompt: string): Promise<string | null> {
	const apiKey = process.env.AI_API_KEY;
	if (!apiKey) {
		return null;
	}

	try {
		const response = await fetch(AI_ENDPOINT, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: AI_MODEL,
				input: prompt,
			}),
		});

		if (!response.ok) {
			console.warn('[ai] API request failed', response.status, await response.text().catch(() => ''));
			return null;
		}

		const data = (await response.json()) as any;
		const text = data?.output?.[0]?.content?.[0]?.text;
		if (typeof text === 'string' && text.trim().length > 0) {
			return text.trim();
		}
	} catch (error) {
		console.warn('[ai] API request threw, using heuristics instead', error);
	}

	return null;
}

function fallbackBuyerInsights(profile: BuyerProfile, offers: StoreOffer[]): BuyerAiInsights {
	const expiring = profile.inventory.filter((item) => item.status === 'use-soon');
	const restock = profile.inventory.filter((item) => item.status === 'restock');
	const healthiest = profile.inventory.filter((item) => item.status === 'healthy');

	const summaryParts = [
		`${profile.displayName}, you have ${profile.inventory.length} tracked pantry items with ${expiring.length} needing attention soon.`,
		`Weekly spend is tracking at $${profile.purchases.slice(0, 3).reduce((sum, item) => sum + item.total, 0).toFixed(2)} across the last three shops.`,
	];

	if (expiring.length > 0) {
		summaryParts.push(`Focus on using ${expiring[0].name} in the next ${expiring[0].daysLeft ?? 2} days to avoid waste.`);
	}

	const recommendedActions = [
		expiring.length
			? `Prep a quick meal with ${expiring[0].name} and ${expiring[1]?.name ?? 'another fridge staple'} before ${expiring[0].expirationDate ?? 'the weekend'}.`
			: 'Scan your pantry this week to keep waste risk low.',
		restock.length
			? `Add ${restock.map((item) => item.name).join(', ')} to your next order to stay ahead of low stock.`
			: `Great job staying stocked on essentials like ${healthiest[0]?.name ?? 'staples'}.`,
		`Align your Friendsgiving list with the Fresh Grocer bundle to save up to ${offers[0]?.discountPercent ?? 10}%`,
	];

	const inventorySuggestions = offers.slice(0, 2).map((offer) => `Consider the ${offer.storeName} offer: ${offer.description}.`);

	const mealPlan = [
		{
			day: 'Thursday',
			meals: [
				`Breakfast: Kale + egg scramble using ${expiring.find((item) => item.category === 'Produce')?.name ?? 'greens'}`,
				`Lunch: Chickpea grain bowl with ${profile.inventory.find((item) => item.name === 'Brown Rice') ? 'brown rice base' : 'whole grains'}`,
				'Dinner: Sweet potato hash with herbs from the bundle offer',
			],
		},
		{
			day: 'Friday',
			meals: [
				'Smoothie: Spinach, yogurt, and frozen berries',
				`Lunch: Kale salad w/ crunchy chickpeas`,
				'Dinner: Sheet-pan roasted sweet potatoes with tofu',
			],
		},
		{
			day: 'Saturday',
			meals: [
				'Brunch: Pumpkin waffles using canned pumpkin',
				'Snack: Cranberry mocktail happy hour',
				'Dinner: Veggie quiche to clear remaining eggs',
			],
		},
	];

	const dietSchedule = [
		{ day: 'Thursday', focus: 'High fiber + protein', tip: 'Pair leafy greens with legumes to stay full and reduce snacking.' },
		{ day: 'Friday', focus: 'Hydration boost', tip: 'Mix sparkling cranberry juice with citrus slices for a low-sugar spritzer.' },
		{ day: 'Saturday', focus: 'Social balance', tip: 'Use meal prep portions to keep servings aligned with your calorie target.' },
	];

	const dealHighlights = offers.slice(0, 3).map((offer) => `${offer.storeName}: ${offer.description} (ends ${offer.validThrough})`);

	return {
		summary: summaryParts.join(' '),
		recommendedActions,
		inventorySuggestions,
		mealPlan,
		dietSchedule,
		dealHighlights,
	};
}

export async function generateBuyerAiInsights(profile: BuyerProfile, offers: StoreOffer[]): Promise<BuyerAiInsights> {
	const prompt = `You are an AI kitchen coach. Analyze the following JSON for a household pantry and upcoming events, then return a short summary, 3 action items, 2 inventory additions, 3-day meal plan, 3 daily wellness tips, and 3 deal highlights.

${JSON.stringify({ profile, offers }, null, 2)}`;

	const aiText = await callAi(prompt);
	if (aiText) {
		try {
			const parsed = JSON.parse(aiText) as Partial<BuyerAiInsights>;
			if (parsed.summary && parsed.recommendedActions && parsed.mealPlan && parsed.dietSchedule) {
				return {
					summary: parsed.summary,
					recommendedActions: parsed.recommendedActions ?? [],
					inventorySuggestions: parsed.inventorySuggestions ?? [],
					mealPlan: parsed.mealPlan ?? [],
					dietSchedule: parsed.dietSchedule ?? [],
					dealHighlights: parsed.dealHighlights ?? [],
				};
			}
		} catch (error) {
			console.warn('[ai] Unable to parse AI response, falling back', error);
		}
	}

	return fallbackBuyerInsights(profile, offers);
}

function fallbackSellerInsights(profile: SellerProfile, offers: StoreOffer[]): SellerAiInsights {
	const riskyItems = profile.inventory.filter((item) => item.status !== 'healthy');
	const topSignals = profile.demandSignals.slice(0, 2);

	const summaryParts = [
		`${profile.store.name} has ${profile.inventory.length} tracked SKUs, with ${riskyItems.length} needing action to avoid spoilage.`,
		`Demand lift up to ${(topSignals[0]?.expectedLift ?? 0.18 * 100).toFixed(0)}% forecast for zips ${topSignals.map((signal) => signal.zip).join(', ') || profile.store.zip}.`,
	];

	const recommendedActions = [
		riskyItems.length
			? `Launch a ${offers[0]?.description ?? 'bundle promotion'} to move ${riskyItems[0].name} before day ${riskyItems[0].daysOnHand + 2}.`
			: 'Keep current replenishment cadences — all tracked SKUs look healthy.',
		`Coordinate with suppliers for ${topSignals[0]?.focusItems?.[0] ?? 'seasonal produce'} ahead of the ${topSignals[0]?.startDate ?? 'upcoming'} demand window.`,
		`Highlight ${offers[1]?.items?.[0] ?? 'holiday bundles'} in-app to capitalize on buyer meal planning.`,
	];

	const bundleIdeas = offers.map((offer) => `${offer.storeName} x ${profile.store.name}: ${offer.description}`);
	const restockAlerts = riskyItems.map((item) => `Monitor ${item.name}: ${item.daysOnHand} days on hand, status ${item.status}.`);

	return {
		summary: summaryParts.join(' '),
		recommendedActions,
		bundleIdeas,
		restockAlerts,
	};
}

export async function generateSellerAiInsights(profile: SellerProfile, offers: StoreOffer[]): Promise<SellerAiInsights> {
	const prompt = `You are an AI retail analyst. Analyze the seller JSON and produce: summary, 3 action items, 3 bundle ideas, 3 restock or markdown alerts in JSON format.

${JSON.stringify({ profile, offers }, null, 2)}`;

	const aiText = await callAi(prompt);
	if (aiText) {
		try {
			const parsed = JSON.parse(aiText) as Partial<SellerAiInsights>;
			if (parsed.summary && parsed.recommendedActions && parsed.bundleIdeas && parsed.restockAlerts) {
				return {
					summary: parsed.summary,
					recommendedActions: parsed.recommendedActions,
					bundleIdeas: parsed.bundleIdeas,
					restockAlerts: parsed.restockAlerts,
				};
			}
		} catch (error) {
			console.warn('[ai] Unable to parse AI response, falling back', error);
		}
	}

	return fallbackSellerInsights(profile, offers);
}

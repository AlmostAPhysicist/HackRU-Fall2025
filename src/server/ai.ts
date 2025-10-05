import { GoogleGenAI } from '@google/genai';
import type {
	BuyerAiInsights,
	BuyerProfile,
	DietScheduleSuggestion,
	HighlightedInsight,
	MealPlanSuggestion,
	MoodColor,
	SellerAiInsights,
	SellerProfile,
	StoreOffer,
} from './types';

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const DEFAULT_TEMPERATURE = Number.parseFloat(process.env.GEMINI_TEMPERATURE ?? '0.35');
const GENERATION_CONFIG = {
	temperature: Number.isFinite(DEFAULT_TEMPERATURE) ? DEFAULT_TEMPERATURE : 0.35,
	topP: Number.parseFloat(process.env.GEMINI_TOP_P ?? '0.8') || 0.8,
	topK: Number.parseInt(process.env.GEMINI_TOP_K ?? '32', 10) || 32,
	maxOutputTokens: Number.parseInt(process.env.GEMINI_MAX_TOKENS ?? '1152', 10) || 1152,
	thinkingConfig: {
		thinkingBudget: Number.parseInt(process.env.GEMINI_THINKING_BUDGET ?? '0', 10) || 0,
	},
} as const;

function readEnv(names: string[]): string | undefined {
	for (const name of names) {
		const value = typeof process !== 'undefined' ? process.env?.[name] : undefined;
		if (value && value.length > 0) {
			return value;
		}
	}

	if (typeof import.meta !== 'undefined' && (import.meta as any)?.env) {
		for (const name of names) {
			const value = (import.meta as any).env?.[name];
			if (value && value.length > 0) {
				return value;
			}
		}
	}

	return undefined;
}

const aiClient = (() => {
	const apiKey = readEnv(['GEMINI_API_KEY', 'AI_API_KEY']);
	if (!apiKey) {
		return null;
	}
	return new GoogleGenAI({ apiKey });
})();

let missingApiKeyLogged = false;

async function extractResponseText(response: unknown): Promise<string | null> {
	if (!response || typeof response !== 'object') {
		return null;
	}

	const candidateTextFn = (response as any).text;
	if (typeof candidateTextFn === 'function') {
		const value = candidateTextFn.call(response);
		const resolved = typeof value?.then === 'function' ? await value : value;
		if (typeof resolved === 'string') {
			const trimmed = resolved.trim();
			if (trimmed.length > 0) {
				return trimmed;
			}
		}
	}

	const candidateSources = [
		(response as any)?.response?.candidates,
		(response as any)?.candidates,
	];

	for (const source of candidateSources) {
		if (!Array.isArray(source)) {
			continue;
		}

		for (const candidate of source) {
			const parts = candidate?.content?.parts;
			if (!Array.isArray(parts)) {
				continue;
			}

			const combined = parts
				.map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
				.join('')
				.trim();

			if (combined.length > 0) {
				return combined;
			}
		}
	}

	return null;
}

async function callAi(prompt: string): Promise<string | null> {
	if (!aiClient) {
		if (!missingApiKeyLogged) {
			missingApiKeyLogged = true;
			console.warn('[ai] Gemini client unavailable. Set GEMINI_API_KEY or AI_API_KEY to enable live insights.');
		}
		return null;
	}

	try {
		const response = await aiClient.models.generateContent({
			model: GEMINI_MODEL,
			contents: [
				{
					role: 'user',
					parts: [{ text: prompt }],
				},
			],
			config: GENERATION_CONFIG,
		});

		const output = await extractResponseText(response);
		if (output) {
			return output;
		}
	} catch (error) {
		console.warn('[ai] Gemini request failed, using heuristics instead', error);
	}

	return null;
}

function extractJsonPayload(text: string): string {
	const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
	if (fenced && fenced[1]) {
		return fenced[1].trim();
	}

	const firstBrace = text.indexOf('{');
	const lastBrace = text.lastIndexOf('}');
	const firstBracket = text.indexOf('[');
	const lastBracket = text.lastIndexOf(']');

	if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
		return text.slice(firstBrace, lastBrace + 1).trim();
	}

	if (firstBracket !== -1 && lastBracket !== -1 && firstBracket < lastBracket) {
		return text.slice(firstBracket, lastBracket + 1).trim();
	}

	return text.trim();
}

async function callAiJson<T>(prompt: string): Promise<T | null> {
	const raw = await callAi(prompt);
	if (!raw) {
		return null;
	}

	try {
		const payload = extractJsonPayload(raw);
		return JSON.parse(payload) as T;
	} catch (error) {
		console.warn('[ai] Unable to parse Gemini JSON payload', error, '\nRaw response:', raw);
		return null;
	}
}

function ensureMood(value: unknown, fallback: MoodColor = 'amber'): MoodColor {
	if (typeof value !== 'string') {
		return fallback;
	}

	const normalized = value.toLowerCase();
	if (normalized === 'green' || normalized === 'amber' || normalized === 'red') {
		return normalized;
	}

	return fallback;
}

function formatInsight(keyword: string, mood: MoodColor, detail: string): HighlightedInsight {
	return {
		keyword: keyword.trim().toUpperCase(),
		mood,
		detail: detail.trim(),
	};
}

function parseInsight(input: any): HighlightedInsight | null {
	if (!input || typeof input !== 'object') {
		return null;
	}

	const keyword = typeof input.keyword === 'string' ? input.keyword.trim() : '';
	const detail = typeof input.detail === 'string' ? input.detail.trim() : '';
	if (!keyword || !detail) {
		return null;
	}

	return {
		keyword: keyword.toUpperCase(),
		mood: ensureMood((input as any).mood),
		detail,
	};
}

function parseInsightArray(value: any): HighlightedInsight[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.map(parseInsight).filter(Boolean) as HighlightedInsight[];
}

function parseMealPlan(value: any): MealPlanSuggestion[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((entry) => {
			if (!entry || typeof entry !== 'object') {
				return null;
			}

			const day = typeof entry.day === 'string' ? entry.day.trim() : '';
			if (!day) {
				return null;
			}

			const meals = parseInsightArray((entry as any).meals);
			const addOns = parseInsightArray((entry as any).addOns);

			return {
				day,
				meals,
				addOns: addOns.length > 0 ? addOns : undefined,
			};
		})
		.filter(Boolean) as MealPlanSuggestion[];
}

function parseDietSchedule(value: any): DietScheduleSuggestion[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((entry) => {
			if (!entry || typeof entry !== 'object') {
				return null;
			}

			const day = typeof entry.day === 'string' ? entry.day.trim() : '';
			if (!day) {
				return null;
			}

			const focus = parseInsight((entry as any).focus);
			const tip = parseInsight((entry as any).tip);
			if (!focus || !tip) {
				return null;
			}

			return { day, focus, tip };
		})
		.filter(Boolean) as DietScheduleSuggestion[];
}

const BUYER_STATUS_MOOD: Record<string, MoodColor> = {
	healthy: 'green',
	'use-soon': 'amber',
	restock: 'red',
	overflow: 'amber',
};

const SELLER_STATUS_MOOD: Record<string, MoodColor> = {
	healthy: 'green',
	risk: 'amber',
	critical: 'red',
};

function fallbackBuyerInsights(profile: BuyerProfile, offers: StoreOffer[]): BuyerAiInsights {
	const expiring = profile.inventory.filter((item) => item.status === 'use-soon');
	const restock = profile.inventory.filter((item) => item.status === 'restock');
	const healthiest = profile.inventory.filter((item) => item.status === 'healthy');
	const hasInventory = profile.inventory.length > 0;

	const wasteMood = hasInventory ? (expiring.length ? BUYER_STATUS_MOOD['use-soon'] : BUYER_STATUS_MOOD.healthy) : 'amber';

	const summary: HighlightedInsight[] = [
		formatInsight(
			'PANTRY LOAD',
			wasteMood,
			`${hasInventory ? profile.inventory.length : '0'} tracked items • ${expiring.length} use-soon • ${restock.length} to restock.`,
		),
		formatInsight(
			'BUDGET TREND',
			hasInventory ? 'green' : 'amber',
			`Recent spend $${profile.purchases.slice(0, 3).reduce((sum, item) => sum + item.total, 0).toFixed(2)} • Weekly budget $${profile.budgetPerWeek}.`,
		),
	];

	if (expiring.length > 0) {
		summary.push(formatInsight('WASTE WATCH', 'red', `Use ${expiring[0].name} within ${expiring[0].daysLeft ?? 2} days to prevent spoilage.`));
	} else if (!hasInventory) {
		summary.push(formatInsight('KICKSTART', 'green', 'No pantry items yet — perfect time to grab high-fiber staples from local bundles.'));
	}

	const recommendedActions: HighlightedInsight[] = [
		expiring.length
			? formatInsight('WASTE RISK', 'red', `Prep ${expiring[0].name} with ${expiring[1]?.name ?? 'staples'} before ${expiring[0].expirationDate ?? 'the weekend'}.`)
			: formatInsight(
				'INVENTORY SCAN',
				hasInventory ? 'green' : 'amber',
				hasInventory ? 'Quick shelf check keeps your waste score low.' : 'Add starter veggies and proteins to unlock smart coaching.',
			),
		restock.length
			? formatInsight('RESTOCK PLAN', BUYER_STATUS_MOOD.restock, `Add ${restock.map((item) => item.name).join(', ')} to your next basket to avoid gaps.`)
			: formatInsight('HEALTHY BALANCE', BUYER_STATUS_MOOD.healthy, `${healthiest[0]?.name ?? 'Leafy greens'} are well stocked — keep rotating them into meals.`),
	];

	const offerHighlights = offers.slice(0, 3).map((offer) =>
		formatInsight(offer.type === 'bundle' ? 'BUNDLE' : 'MARKDOWN', offer.discountPercent >= 15 ? 'green' : 'amber', `${offer.storeName}: ${offer.description} • Ends ${offer.validThrough}.`),
	);

	const inventorySuggestions: HighlightedInsight[] = [...offerHighlights];

	if (!hasInventory) {
		inventorySuggestions.push(
			formatInsight('STARTER STAPLES', 'green', 'Add chickpeas, brown rice, and spinach for versatile bowls and salads.'),
			formatInsight('LEAN PROTEIN', 'green', 'Pick up tofu or rotisserie chicken from Fresh Grocer bundles for quick dinners.'),
		);
	}

	const mealPlan: MealPlanSuggestion[] = [
		{
			day: 'Day 1',
			meals: [
				formatInsight('BREAKFAST', 'green', `Greek yogurt parfait with ${hasInventory ? 'pantry granola' : 'local granola'} and berries.`),
				formatInsight('LUNCH', 'green', `${hasInventory ? 'Chickpea' : 'Market'} grain bowl with roasted veggies and citrus dressing.`),
				formatInsight('DINNER', hasInventory ? 'amber' : 'green', `${hasInventory ? 'Use-soon sweet potatoes' : 'Roasted sweet potatoes'} with herb chimichurri.`),
			],
			addOns: hasInventory
				? undefined
				: [formatInsight('GROCERY BOOST', 'green', 'Pick up pre-washed greens & canned beans to support tomorrow’s meals.')],
		},
		{
			day: 'Day 2',
			meals: [
				formatInsight('BREAKFAST', 'green', 'Spinach smoothie with frozen fruit and flaxseed.'),
				formatInsight('LUNCH', 'green', 'Whole-grain wrap with hummus, crunchy veggies, and citrus slaw.'),
				formatInsight('DINNER', 'amber', 'One-pan tofu stir-fry featuring leafy greens and peppers.'),
			],
			addOns: hasInventory ? undefined : [formatInsight('MARKET PICKUP', 'green', 'Add stir-fry veggie pack + tofu from nearby markdowns.')],
		},
		{
			day: 'Day 3',
			meals: [
				formatInsight('BRUNCH', 'green', 'Veggie frittata with herbs and leftover roast veg.'),
				formatInsight('SNACK', 'green', 'Cranberry spritzer with sparkling water for hydration.'),
				formatInsight('DINNER', 'green', 'Sheet-pan citrus salmon with sweet potatoes (swap lentils if plant-based).'),
			],
			addOns: hasInventory ? undefined : [formatInsight('BUNDLE SAVE', 'green', 'Grab omega-rich salmon or lentils from the Healthy Heart bundle.')],
		},
	];

	const dietSchedule: DietScheduleSuggestion[] = [
		{
			day: 'Day 1',
			focus: formatInsight('FIBER FOCUS', 'green', 'Combine legumes with leafy greens to support digestion.'),
			tip: formatInsight('PROTEIN BOOST', 'green', 'Add Greek yogurt or tofu to each meal to stay full.'),
		},
		{
			day: 'Day 2',
			focus: formatInsight('HYDRATION', 'green', 'Sip infused water or spritzers between meals.'),
			tip: formatInsight('CARB BALANCE', 'amber', 'Pair whole grains with veggies to stabilize energy.'),
		},
		{
			day: 'Day 3',
			focus: formatInsight('SOCIAL BALANCE', 'green', 'Pre-portion servings before gatherings to stay on target.'),
			tip: formatInsight('TREAT SMART', 'amber', 'Use fruit-forward desserts to curb sugar spikes.'),
		},
	];

	const dealHighlights =
		offerHighlights.length > 0
			? [...offerHighlights]
			: [formatInsight('LOCAL TIP', 'amber', 'Check Fresh Grocer weekly ad for produce bundles aligned to your meal plan.')];

	if (!hasInventory && dealHighlights.length < 3) {
		dealHighlights.push(formatInsight('COMMUNITY CO-OP', 'green', 'Join the Wakefern CSA pickup for seasonal produce under $25/week.'));
	}

	if (recommendedActions.length < 3) {
		recommendedActions.push(formatInsight('MEAL PREP', 'green', 'Batch roast veggies on Sunday to simplify mid-week dinners.'));
	}

	return {
		summary,
		recommendedActions,
		inventorySuggestions,
		mealPlan,
		dietSchedule,
		dealHighlights,
	};
}

export async function generateBuyerAiInsights(profile: BuyerProfile, offers: StoreOffer[]): Promise<BuyerAiInsights> {
	const fallback = fallbackBuyerInsights(profile, offers);
	const context = JSON.stringify({ profile, offers }, null, 2);

	const narrativePrompt = `You are GEMINI, a culinary strategist. Using the provided buyer profile and nearby offers, generate JSON with colour-coded insights.

Return ONLY JSON shaped exactly like:
{
  "summary": [ { "keyword": "...", "mood": "green|amber|red", "detail": "..." } ],
  "recommendedActions": [ { "keyword": "...", "mood": "...", "detail": "..." } ],
  "inventorySuggestions": [ { "keyword": "...", "mood": "...", "detail": "..." } ],
  "dealHighlights": [ { "keyword": "...", "mood": "...", "detail": "..." } ]
}

Rules:
- Use 2-3 summary items referencing pantry load, budget, and risk. Keep detail <= 28 words. Keywords must be ALL CAPS (1-3 words).
- recommendedActions must contain 3 distinct steps grounded in inventory statuses or household goals. Use RED for urgent waste/restock risks, AMBER for watch items, GREEN for healthy wins.
- inventorySuggestions must propose items or bundles from offers; if inventory array is empty, include at least 4 starter staples referencing local stores/bundles.
- dealHighlights should spotlight the strongest offers or community programs; if none exist, suggest actionable alternatives.
- Do not include markdown, prose, or arrays of strings—only the specified object arrays.

Context JSON:
${context}`;

	type BuyerNarrativePayload = {
		summary?: unknown;
		recommendedActions?: unknown;
		inventorySuggestions?: unknown;
		dealHighlights?: unknown;
	};

	const narrative = await callAiJson<BuyerNarrativePayload>(narrativePrompt);

	const mealPrompt = `You are GEMINI, a culinary meal-planning expert. Build a short plan using buyer inventory, dietary goals, and offers.

Return ONLY JSON shaped exactly like:
{
  "mealPlan": [
    {
      "day": "Day 1",
      "meals": [ { "keyword": "...", "mood": "green|amber|red", "detail": "..." } ],
      "addOns": [ { "keyword": "...", "mood": "...", "detail": "..." } ]
    }
  ],
  "dietSchedule": [
    {
      "day": "Day 1",
      "focus": { "keyword": "...", "mood": "...", "detail": "..." },
      "tip": { "keyword": "...", "mood": "...", "detail": "..." }
    }
  ]
}

Rules:
- Provide mealPlan for three consecutive days (Day 1-3). Each day must include breakfast/lunch/dinner (and optional snacks) referencing available or recommended items. Use GREEN when meal aligns to goals, AMBER when watch portions, RED only for urgent clearance items.
- Always include addOns when inventory is empty or thin; link suggestions to nearby stores or bundles from offers.
- Diet schedule must have three entries matching Day 1-3 with concise coaching statements.
- Avoid markdown, explanations, or nulls. Omit addOns array when not needed.

Context JSON:
${context}`;

	type BuyerMealPayload = {
		mealPlan?: unknown;
		dietSchedule?: unknown;
	};

	const mealData = await callAiJson<BuyerMealPayload>(mealPrompt);

	const summary = narrative ? parseInsightArray(narrative.summary) : [];
	const recommendedActions = narrative ? parseInsightArray(narrative.recommendedActions) : [];
	const inventorySuggestions = narrative ? parseInsightArray(narrative.inventorySuggestions) : [];
	const dealHighlights = narrative ? parseInsightArray(narrative.dealHighlights) : [];

	const mealPlan = mealData ? parseMealPlan(mealData.mealPlan) : [];
	const dietSchedule = mealData ? parseDietSchedule(mealData.dietSchedule) : [];

	return {
		summary: summary.length ? summary : fallback.summary,
		recommendedActions: recommendedActions.length ? recommendedActions : fallback.recommendedActions,
		inventorySuggestions: inventorySuggestions.length ? inventorySuggestions : fallback.inventorySuggestions,
		dealHighlights: dealHighlights.length ? dealHighlights : fallback.dealHighlights,
		mealPlan: mealPlan.length ? mealPlan : fallback.mealPlan,
		dietSchedule: dietSchedule.length ? dietSchedule : fallback.dietSchedule,
	};
}

function fallbackSellerInsights(profile: SellerProfile, offers: StoreOffer[]): SellerAiInsights {
	const riskyItems = profile.inventory.filter((item) => item.status !== 'healthy');
	const topSignals = profile.demandSignals.slice(0, 2);

	const summary: HighlightedInsight[] = [
		formatInsight('SKU COVERAGE', riskyItems.length ? 'amber' : 'green', `${profile.inventory.length} tracked items • ${riskyItems.length} need action.`),
		formatInsight(
			'DEMAND LIFT',
			'green',
			`${((topSignals[0]?.expectedLift ?? 0.18) * 100).toFixed(0)}% upside forecast across ${topSignals.map((signal) => signal.zip).join(', ') || profile.store.zip}.`,
		),
	];

	const recommendedActions: HighlightedInsight[] = [
		riskyItems.length
			? formatInsight('SPOILAGE RISK', 'red', `Launch ${offers[0]?.description ?? 'flash bundle'} to move ${riskyItems[0].name} within ${riskyItems[0].daysOnHand + 2} days.`)
			: formatInsight('INVENTORY HEALTH', 'green', 'All monitored SKUs look healthy — maintain cadence.'),
		formatInsight('SUPPLY SYNC', 'amber', `Align vendors on ${topSignals[0]?.focusItems?.[0] ?? 'seasonal produce'} ahead of ${topSignals[0]?.startDate ?? 'demand window'}.`),
		formatInsight('BUYER ALIGNMENT', 'green', `Feature ${offers[1]?.items?.[0] ?? 'meal bundles'} in-app to match nearby buyer meal plans.`),
	];

	const bundleIdeas: HighlightedInsight[] =
		offers.length > 0
			? offers.map((offer) => formatInsight('BUNDLE IDEA', 'green', `${offer.storeName} × ${profile.store.name}: ${offer.description}`))
			: [formatInsight('COMMUNITY EVENT', 'amber', 'Partner with local CSA to feature farm boxes in-app.')];

	const restockAlerts: HighlightedInsight[] =
		riskyItems.length > 0
			? riskyItems.map((item) =>
					formatInsight(
						item.name,
						SELLER_STATUS_MOOD[item.status] ?? 'amber',
						`${item.daysOnHand} days on hand • Status ${item.status} • Margin ${Math.round(item.margin * 100)}%.`,
					),
				)
			: [formatInsight('FORECAST SCAN', 'green', 'No critical risks detected — monitor lift in upcoming demand zips.')];

	return {
		summary,
		recommendedActions,
		bundleIdeas,
		restockAlerts,
	};
}

export async function generateSellerAiInsights(profile: SellerProfile, offers: StoreOffer[]): Promise<SellerAiInsights> {
	const fallback = fallbackSellerInsights(profile, offers);
	const context = JSON.stringify({ profile, offers }, null, 2);

	const prompt = `You are GEMINI, a grocery retail strategist. Produce JSON insights with explicit mood colours.

Return ONLY JSON shaped exactly like:
{
  "summary": [ { "keyword": "...", "mood": "green|amber|red", "detail": "..." } ],
  "recommendedActions": [ { "keyword": "...", "mood": "...", "detail": "..." } ],
  "bundleIdeas": [ { "keyword": "...", "mood": "...", "detail": "..." } ],
  "restockAlerts": [ { "keyword": "...", "mood": "...", "detail": "..." } ]
}

Rules:
- Provide at least 2 summary insights focusing on inventory coverage and demand signals.
- Create 3 recommendedActions tied to spoilage risk, supply planning, and buyer demand. Use RED for critical stock, AMBER for watch items, GREEN for wins.
- bundleIdeas should reference offers or propose co-marketing opportunities when offers array is empty.
- restockAlerts must highlight risky SKUs with actionable guidance; if none exist, suggest proactive monitoring.
- Avoid markdown or narrative text—only the JSON object.

Context JSON:
${context}`;

	const parsed = await callAiJson<{
		summary?: unknown;
		recommendedActions?: unknown;
		bundleIdeas?: unknown;
		restockAlerts?: unknown;
	}>(prompt);

	if (!parsed) {
		return fallback;
	}

	const summary = parseInsightArray(parsed.summary);
	const recommendedActions = parseInsightArray(parsed.recommendedActions);
	const bundleIdeas = parseInsightArray(parsed.bundleIdeas);
	const restockAlerts = parseInsightArray(parsed.restockAlerts);

	return {
		summary: summary.length ? summary : fallback.summary,
		recommendedActions: recommendedActions.length ? recommendedActions : fallback.recommendedActions,
		bundleIdeas: bundleIdeas.length ? bundleIdeas : fallback.bundleIdeas,
		restockAlerts: restockAlerts.length ? restockAlerts : fallback.restockAlerts,
	};
}

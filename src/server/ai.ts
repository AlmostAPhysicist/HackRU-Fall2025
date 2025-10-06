import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';
import type {
	BuyerAiInsights,
	BuyerProfile,
	BuyerKpiCallout,
	BuyerKpiMetric,
	DietScheduleSuggestion,
	HighlightedInsight,
	InventoryAnnotation,
	MealPlanSuggestion,
	MoodColor,
	NutritionRecommendation,
	PantryNutritionSummary,
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

// Attempt to read a local .env file for development convenience when process.env is not populated
function readEnvFileValue(names: string[]): string | undefined {
	try {
		const envPath = path.join(process.cwd(), '.env');
		const raw = fs.readFileSync(envPath, 'utf-8');
		for (const line of raw.split(/\r?\n/)) {
			if (!line || line.trim().startsWith('#')) continue;
			const [key, ...rest] = line.split('=');
			if (!key || rest.length === 0) continue;
			const value = rest.join('=').trim();
			if (names.includes(key.trim()) && value.length > 0) {
				return value;
			}
		}
	} catch (err) {
		// ignore missing .env silently
	}
	return undefined;
}

const aiClient = (() => {
	let apiKey = readEnv(['GEMINI_API_KEY', 'AI_API_KEY']);
	if (!apiKey) {
		apiKey = readEnvFileValue(['GEMINI_API_KEY', 'AI_API_KEY']);
	}
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
		try {
			return JSON.parse(payload) as T;
		} catch (firstErr) {
			// Attempt to sanitize common JSON issues (trailing commas, comments, unquoted keys)
				try {
					const sanitized = sanitizeJsonString(payload);
					try {
						return JSON.parse(sanitized) as T;
					} catch (sanErr) {
						// Local repair helper to avoid cross-file scope issues
						const repairLocal = (s: string) => {
							let candidate = s;
							try {
								JSON.parse(candidate);
								return candidate;
							} catch (e) {
								// Trim after last closing bracket/brace
								const last = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
								if (last !== -1 && last < candidate.length - 1) {
									candidate = candidate.slice(0, last + 1);
								}
								// Balance quotes/brackets/braces
								let braceDelta = 0;
								let bracketDelta = 0;
								let inString = false;
								let escaped = false;
								for (let i = 0; i < candidate.length; i++) {
									const ch = candidate[i];
									if (ch === '"' && !escaped) inString = !inString;
									if (inString && ch === '\\' && !escaped) {
										escaped = true;
										continue;
									}
									if (!inString) {
										if (ch === '{') braceDelta++;
										else if (ch === '}') braceDelta--;
										else if (ch === '[') bracketDelta++;
										else if (ch === ']') bracketDelta--;
									}
									escaped = false;
								}
								if (inString) candidate += '"';
								if (bracketDelta > 0) candidate += ']'.repeat(bracketDelta);
								if (braceDelta > 0) candidate += '}'.repeat(braceDelta);
								candidate = sanitizeJsonString(candidate);
								return candidate;
							}
						};

						try {
							const repaired = repairLocal(sanitized);
							return JSON.parse(repaired) as T;
						} catch (repairErr) {
							console.warn('[ai] Unable to parse Gemini JSON payload after sanitization and repair', repairErr, '\nOriginal payload:', payload, '\nSanitized payload:', sanitized);
							return null;
						}
					}
				} catch (secondErr) {
					console.warn('[ai] Unable to parse Gemini JSON payload after sanitization', secondErr, '\nOriginal payload:', payload, '\nSanitized payload:', sanitizeJsonString(payload));
					return null;
				}
		}
	} catch (error) {
		console.warn('[ai] Unexpected error extracting/parsing Gemini JSON payload', error, '\nRaw response:', raw);
		return null;
	}
}

/**
 * Heuristic sanitizer to fix common malformed JSON from language models.
 * - Removes JS-style comments
 * - Removes trailing commas before } or ]
 * - Quotes unquoted object keys when safe
 * - Strips control characters that break parsers
 */
function sanitizeJsonString(input: string): string {
	let out = input;

	// Remove block comments /* */ and line comments //
	out = out.replace(/\/\*[\s\S]*?\*\//g, '');
	out = out.replace(/(^|[^:])\/\/[^\n\r]*/g, '$1');

	// Remove stray backticks or ``` markers
	out = out.replace(/```json|```/gi, '');

	// Remove control characters except common whitespace (tab, newline)
	out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

	// Quote unquoted object keys: { key: -> { "key":
	// Only when key looks like an identifier (no spaces, not quoted)
	out = out.replace(/([\{,\n\r\s])(\s*)([A-Za-z_\$@][A-Za-z0-9_\$@-]*?)\s*:\s*/g, '$1"$3": ');

	// Remove trailing commas before } or ]
	out = out.replace(/,\s*(}[\])])/g, '$1');
	out = out.replace(/,\s*([}\]])/g, '$1');

	// Collapse multiple commas
	out = out.replace(/,\s*,+/g, ',');

	// Trim
	out = out.trim();

	return out;
}

/**
 * Best-effort JSON repair for truncated or unbalanced JSON emitted by LLMs.
 * - Attempts to close any unbalanced braces/brackets
 * - Attempts to close dangling open quotes
 * - Removes trailing partial tokens after the last balanced top-level object/array
 */
// repairJsonString removed; using a local repair helper in callAiJson instead

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

const KPI_HEADLINES: Record<BuyerKpiMetric, string> = {
	wasteRisk: 'WASTE RISK',
	pantryHealth: 'PANTRY LOAD',
	budgetHealth: 'BUDGET HEALTH',
	eventReadiness: 'EVENT READINESS',
};

const KPI_METRICS: BuyerKpiMetric[] = ['wasteRisk', 'pantryHealth', 'budgetHealth', 'eventReadiness'];

function ensureKpiMetric(value: unknown): BuyerKpiMetric {
	if (typeof value === 'string') {
		const normalized = value as BuyerKpiMetric;
		if ((KPI_METRICS as string[]).includes(normalized)) {
			return normalized;
		}
	}
	return 'wasteRisk';
}

function parseKpiCallouts(value: any): BuyerKpiCallout[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((entry) => {
			if (!entry || typeof entry !== 'object') {
				return null;
			}
			const metric = ensureKpiMetric((entry as any).metric);
			const detail = typeof entry.detail === 'string' ? entry.detail.trim() : '';
			if (!detail) {
				return null;
			}
			const rawHeadline = typeof entry.headline === 'string' ? entry.headline.trim() : '';
			const headline = rawHeadline ? rawHeadline.toUpperCase() : KPI_HEADLINES[metric];
			return {
				metric,
				headline,
				mood: ensureMood((entry as any).mood),
				detail,
			} satisfies BuyerKpiCallout;
		})
		.filter(Boolean) as BuyerKpiCallout[];
}

function parseInventoryAnnotations(value: any): InventoryAnnotation[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((entry) => {
			if (!entry || typeof entry !== 'object') {
				return null;
			}
			const name = typeof entry.name === 'string' ? entry.name.trim() : '';
			const statusLabel = typeof entry.statusLabel === 'string' ? entry.statusLabel.trim() : '';
			const categoryLabel = typeof entry.categoryLabel === 'string' ? entry.categoryLabel.trim() : '';
			if (!name || !statusLabel || !categoryLabel) {
				return null;
			}
			const suggestion = typeof entry.suggestion === 'string' ? entry.suggestion.trim() : undefined;
			return {
				name,
				mood: ensureMood((entry as any).mood),
				statusLabel,
				categoryLabel,
				suggestion,
			} satisfies InventoryAnnotation;
		})
		.filter(Boolean) as InventoryAnnotation[];
}

function parseNutritionRecommendations(value: any): NutritionRecommendation[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((entry) => {
			if (!entry || typeof entry !== 'object') {
				return null;
			}
			const item = typeof entry.item === 'string' ? entry.item.trim() : '';
			const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
			if (!item || !reason) {
				return null;
			}
			const storeSuggestion = typeof entry.storeSuggestion === 'string' ? entry.storeSuggestion.trim() : undefined;
			const mood = ensureMood((entry as any).mood, 'green');
			return { item, reason, storeSuggestion, mood } satisfies NutritionRecommendation;
		})
		.filter(Boolean) as NutritionRecommendation[];
}

function parsePantryNutrition(value: any): PantryNutritionSummary | null {
	if (!value || typeof value !== 'object') {
		return null;
	}

	const macroBalance = typeof (value as any).macroBalance === 'string' ? (value as any).macroBalance.trim() : '';
	const missingNutrients = Array.isArray((value as any).missingNutrients)
		? (value as any).missingNutrients
			.map((item: unknown) => (typeof item === 'string' ? item.trim() : ''))
			.filter(Boolean)
		: [];
	const recommendedAdditions = parseNutritionRecommendations((value as any).recommendedAdditions);
	const overallMood = ensureMood((value as any).overallMood, 'amber');

	if (!macroBalance && missingNutrients.length === 0 && recommendedAdditions.length === 0) {
		return null;
	}

	return {
		macroBalance: macroBalance || 'No macro balance insight available.',
		missingNutrients,
		recommendedAdditions,
		overallMood,
	} satisfies PantryNutritionSummary;
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
	const recentSpend = profile.purchases.slice(0, 3).reduce((sum, item) => sum + item.total, 0);
	const budgetDelta = profile.budgetPerWeek - recentSpend;
	const eventPlanner = profile.events;
	const activeEvents = eventPlanner.length;
	const upcomingNeeds = eventPlanner.flatMap((event) =>
		event.shoppingList.filter((item) => item.status !== 'covered').map((item) => `${item.name} • ${item.quantity} ${item.unit}`),
	);

	const statusLabelMap: Record<string, string> = {
		healthy: 'Healthy',
		'use-soon': 'Use Soon',
		restock: 'Restock Soon',
		overflow: 'Overflow',
	};

	const deriveCategoryLabel = (item: BuyerProfile['inventory'][number]): string => {
		const category = item.category?.toLowerCase() ?? '';
		const name = item.name.toLowerCase();
		if (category.includes('produce') || category.includes('vegetable') || category.includes('greens') || name.includes('kale') || name.includes('spinach')) {
			return 'Fresh produce';
		}
		if (category.includes('protein') || name.includes('tofu') || name.includes('egg') || name.includes('chicken') || name.includes('bean') || name.includes('lentil')) {
			return 'Protein source';
		}
		if (category.includes('grain') || name.includes('rice') || name.includes('pasta') || name.includes('oat')) {
			return 'Whole-grain staple';
		}
		if (category.includes('snack') || category.includes('treat')) {
			return 'Snack';
		}
		if (category.includes('dairy') || name.includes('milk') || name.includes('yogurt')) {
			return 'Dairy & calcium';
		}
		return 'Pantry staple';
	};

	const deriveSuggestion = (item: BuyerProfile['inventory'][number]): string | undefined => {
		if (item.status === 'use-soon') {
			return `Use within ${item.daysLeft ?? 2} days — fold into quick meals or snacks.`;
		}
		if (item.status === 'restock') {
			return 'Add to this week’s shopping list to avoid low inventory.';
		}
		if (item.status === 'overflow') {
			return 'Plan recipes to work through extras before storage fills up.';
		}
		return undefined;
	};

	const stapleNames = healthiest.slice(0, 2).map((item) => item.name).join(', ') || 'pantry staples';
	const urgentNames = expiring.slice(0, 2).map((item) => item.name).join(', ');

	const heroSummary = hasInventory
		? urgentNames
			? `Good staples (${stapleNames}) but fresh items (${urgentNames}) need immediate attention to prevent waste.`
			: `Pantry staples (${stapleNames}) look solid—keep rotating them into this week’s meals.`
		: 'Pantry is empty — add a few essentials to unlock smarter plans and budget tracking.';

	const overviewCommentary = hasInventory
		? `Recent spend $${recentSpend.toFixed(2)} of $${profile.budgetPerWeek} budget ${budgetDelta >= 0 ? 'leaves room for targeted produce pickups.' : 'is running hot—lean on pantry items first.'} ${activeEvents > 0 ? `Event readiness tracks ${activeEvents} upcoming plan${activeEvents > 1 ? 's' : ''}.` : 'No events on deck—use the window for batch cooking.'}`
		: 'Add what’s in your fridge or pantry so we can balance budgets, meal plans, and offers for you.';

	const wasteMood = hasInventory ? (expiring.length ? BUYER_STATUS_MOOD['use-soon'] : BUYER_STATUS_MOOD.healthy) : 'amber';
	const budgetMood: MoodColor = budgetDelta >= 0 ? 'green' : 'amber';
	const eventMood: MoodColor = activeEvents === 0 ? 'green' : upcomingNeeds.length > 0 ? 'amber' : 'green';

	const kpiCallouts: BuyerKpiCallout[] = [
		{
			metric: 'pantryHealth',
			headline: KPI_HEADLINES.pantryHealth,
			mood: hasInventory ? 'green' : 'amber',
			detail: hasInventory
				? `${profile.inventory.length} tracked items • ${expiring.length} use-soon • ${restock.length} to restock.`
				: 'No pantry items logged yet — add a few staples to kickstart personalized coaching.',
		},
		{
			metric: 'wasteRisk',
			headline: KPI_HEADLINES.wasteRisk,
			mood: wasteMood,
			detail:
				expiring.length > 0
					? `High waste risk: ${expiring.slice(0, 2).map((item) => `${item.name} (${item.expirationDate ?? 'soon'})`).join(', ')} need to be used first.`
					: 'Waste risk is low — keep rotating older items to maintain the score.',
		},
		{
			metric: 'budgetHealth',
			headline: KPI_HEADLINES.budgetHealth,
			mood: budgetMood,
			detail:
				budgetDelta >= 0
					? `Tracking under budget with $${Math.abs(budgetDelta).toFixed(2)} to spare for strategic produce or proteins.`
					: `Spending exceeded budget by $${Math.abs(budgetDelta).toFixed(2)} — prioritize pantry-first meals this week.`,
		},
		{
			metric: 'eventReadiness',
			headline: KPI_HEADLINES.eventReadiness,
			mood: eventMood,
			detail:
				activeEvents > 0
					? `${activeEvents} upcoming plan${activeEvents > 1 ? 's' : ''}; finalize menus and cover ${upcomingNeeds.slice(0, 3).join(', ') || 'remaining staples'} for full readiness.`
					: 'No events scheduled — use the flexibility to experiment with new meal prep routines.',
		},
	];

	const recommendations: HighlightedInsight[] = [
		expiring.length
			? formatInsight('USE EGGS & KALE', 'red', `Plan meals around ${expiring.map((item) => item.name).join(' and ')} in the next ${expiring[0]?.daysLeft ?? 2} days.`)
			: formatInsight('INVENTORY CHECK', hasInventory ? 'green' : 'amber', hasInventory ? 'Quick shelf scan to confirm quantities keeps waste in check.' : 'Log staples like grains, legumes, and greens to unlock smarter tips.'),
		restock.length
			? formatInsight('RESTOCK GREENS', BUYER_STATUS_MOOD.restock, `Add ${restock.map((item) => item.name).join(', ')} to the next trip to keep meals balanced.`)
			: formatInsight('KEEP ROTATING', BUYER_STATUS_MOOD.healthy, `${healthiest[0]?.name ?? 'Leafy greens'} are in great shape — feature them in upcoming meals.`),
		formatInsight('PLAN POTLUCK', 'amber', activeEvents > 0 ? 'Finalize potluck dishes and align shopping list with pantry items to minimize spend.' : 'No events scheduled — consider planning a gathering using pantry staples.'),
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

	const inventoryAnnotations: InventoryAnnotation[] = profile.inventory.map((item) => ({
		name: item.name,
		mood: BUYER_STATUS_MOOD[item.status] ?? 'amber',
		statusLabel: statusLabelMap[item.status] ?? item.status.replace('-', ' '),
		categoryLabel: deriveCategoryLabel(item),
		suggestion: deriveSuggestion(item),
	}));

	const categorySet = new Set(profile.inventory.map((item) => item.category?.toLowerCase() ?? ''));
	const nameSet = new Set(profile.inventory.map((item) => item.name.toLowerCase()));
	const missingNutrients: string[] = [];
	if (![...categorySet].some((cat) => cat.includes('produce') || cat.includes('vegetable') || cat.includes('greens') || cat.includes('fruit'))) {
		missingNutrients.push('Fresh produce for vitamins A & C');
	}
	const hasProtein = [...nameSet].some((name) => name.includes('egg') || name.includes('tofu') || name.includes('chickpea') || name.includes('bean') || name.includes('lentil')) ||
		[...categorySet].some((cat) => cat.includes('protein'));
	if (!hasProtein) {
		missingNutrients.push('Lean protein options to balance meals');
	}
	const hasWholeGrain = [...nameSet].some((name) => name.includes('rice') || name.includes('oat') || name.includes('quinoa')) ||
		[...categorySet].some((cat) => cat.includes('grain'));
	if (!hasWholeGrain) {
		missingNutrients.push('Whole grains for sustained energy');
	}

	const nutritionRecommendations: NutritionRecommendation[] = [];
	if (missingNutrients.some((note) => note.includes('Fresh produce'))) {
		nutritionRecommendations.push({
			item: 'Leafy greens mix',
			reason: 'Boosts vitamins, fiber, and freshness alongside pantry grains.',
			storeSuggestion: offers[0]?.storeName ? `Check ${offers[0].storeName} produce bundles.` : undefined,
			mood: 'green',
		});
	}
	if (missingNutrients.some((note) => note.includes('Lean protein'))) {
		nutritionRecommendations.push({
			item: 'Plant-based protein',
			reason: 'Adds versatile protein to balance legumes and grains.',
			storeSuggestion: offers[1]?.storeName ? `See ${offers[1].storeName} markdowns.` : undefined,
			mood: 'amber',
		});
	}
	if (missingNutrients.some((note) => note.includes('Whole grains'))) {
		nutritionRecommendations.push({
			item: 'Whole-grain wraps',
			reason: 'Supports quick lunches and balances macros.',
			storeSuggestion: offers[0]?.storeName ? `Browse bakery aisle at ${offers[0].storeName}.` : undefined,
			mood: 'green',
		});
	}
	if (nutritionRecommendations.length === 0 && offers[0]) {
		nutritionRecommendations.push({
			item: offers[0].items[0] ?? 'Seasonal produce bundle',
			reason: 'Adds freshness to current pantry-heavy meals.',
			storeSuggestion: `Leverage ${offers[0].storeName} offer before ${offers[0].validThrough}.`,
			mood: 'green',
		});
	}

	const pantryNutrition: PantryNutritionSummary = {
		macroBalance: hasInventory
			? `Pantry leans on ${stapleNames.toLowerCase()} with plant proteins — pair with fresh greens to round out meals.`
			: 'Macro balance unavailable until pantry items are logged.',
		missingNutrients,
		recommendedAdditions: nutritionRecommendations,
		overallMood: missingNutrients.length > 1 ? 'amber' : 'green',
	};

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

	if (recommendations.length < 3) {
		recommendations.push(formatInsight('MEAL PREP', 'green', 'Batch roast veggies on Sunday to simplify mid-week dinners.'));
	}

	return {
		heroSummary,
		overviewCommentary,
		kpiCallouts,
		recommendations,
		inventoryAnnotations,
		inventorySuggestions,
		pantryNutrition,
		mealPlan,
		dietSchedule,
		dealHighlights,
	};
}

export async function generateBuyerAiInsights(profile: BuyerProfile, offers: StoreOffer[]): Promise<BuyerAiInsights> {
	const fallback = fallbackBuyerInsights(profile, offers);
	const context = JSON.stringify({ profile, offers }, null, 2);

	const narrativePrompt = `You are GEMINI, a culinary strategist. Using the buyer profile and nearby offers, craft structured coaching with mood colours.

Return ONLY JSON shaped exactly like:
{
  "heroSummary": "...",
  "overviewCommentary": "...",
  "kpiCallouts": [ { "metric": "pantryHealth|wasteRisk|budgetHealth|eventReadiness", "headline": "...", "mood": "green|amber|red", "detail": "..." } ],
  "recommendations": [ { "keyword": "...", "mood": "green|amber|red", "detail": "..." } ],
  "inventoryAnnotations": [ { "name": "...", "mood": "green|amber|red", "statusLabel": "...", "categoryLabel": "...", "suggestion": "..." } ],
  "inventorySuggestions": [ { "keyword": "...", "mood": "green|amber|red", "detail": "..." } ],
  "pantryNutrition": {
    "macroBalance": "...",
    "missingNutrients": ["..."],
    "recommendedAdditions": [ { "item": "...", "reason": "...", "storeSuggestion": "...", "mood": "green|amber|red" } ],
    "overallMood": "green|amber|red"
  },
  "dealHighlights": [ { "keyword": "...", "mood": "green|amber|red", "detail": "..." } ]
}

Rules:
- heroSummary: 1-2 sentences contrasting pantry strengths vs urgent risks. Stay under 260 characters.
- overviewCommentary: budget delta + upcoming events + next focus in <= 2 sentences.
- Provide 3-4 kpiCallouts covering each metric once; detail <= 26 words, headline in Title Case.
- recommendations: 3 actionable coaching steps tied to inventory or goals. Use RED for urgent waste/restock, AMBER for watch, GREEN for healthy wins.
- inventoryAnnotations: include at least 5 items when inventory exists; omit suggestion or set to "" if nothing to add. Use precise status and category labels.
- inventorySuggestions: cite offers or starter staples; if no offers, recommend community resources.
- pantryNutrition: tailor missing nutrients to actual inventory; recommendedAdditions can be empty when coverage is strong.
- dealHighlights: spotlight strongest offers; if none, suggest alternative savings route. Keep every detail grounded in context.
- Never output null; use empty arrays when needed. Do not include markdown or commentary outside JSON.

Context JSON:
${context}`;

	type BuyerNarrativePayload = {
		heroSummary?: unknown;
		overviewCommentary?: unknown;
		kpiCallouts?: unknown;
		recommendations?: unknown;
		inventoryAnnotations?: unknown;
		inventorySuggestions?: unknown;
		pantryNutrition?: unknown;
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

	// Parse mealPlan and dietSchedule early so they can be referenced below
	const mealPlan = mealData ? parseMealPlan(mealData.mealPlan) : [];
	const dietSchedule = mealData ? parseDietSchedule(mealData.dietSchedule) : [];

	// Nutrition rating prompt: ask Gemini to score nutrition categories based on full pantry and upcoming events
		const nutritionPrompt = `You are GEMINI, a nutrition analyst. Using the buyer profile (inventory) and upcoming event plans (shoppingList entries), rate the buyer's pantry across these categories: Protein, Produce & fiber, Healthy fats, Whole grains, Hydration & electrolytes.

Return ONLY JSON shaped EXACTLY like:
{
	"summaryText": "...", // 1-2 sentence summary
	"categories": [
		{ "id": "protein", "label": "Protein balance", "score": 0-100, "detail": "..." },
		{ "id": "produce", "label": "Produce & fiber", "score": 0-100, "detail": "..." },
		{ "id": "healthy-fats", "label": "Healthy fats", "score": 0-100, "detail": "..." },
		{ "id": "whole-grains", "label": "Whole grains", "score": 0-100, "detail": "..." },
		{ "id": "hydration", "label": "Hydration & electrolytes", "score": 0-100, "detail": "..." }
	],
	"potentialGaps": ["Vitamin C", "Fiber"],
	"recommendedAdditions": [ { "item": "Berries", "reason": "Good source of Vitamin C and fiber, great with yogurt.", "storeSuggestion": "Fresh Grocer Hoboken" } ]
}

Rules:
- Use the full inventory array and any shoppingList items from upcoming events as context; do NOT assume access to any other data.
- Scores should be integers 0-100 and reflect coverage in the pantry + near-term events.
- summaryText should be a concise 1-2 sentence summary (<= 220 chars).
- recommendedAdditions should include storeSuggestion when a local offer or store is present in context; otherwise suggest a generic local grocer.
- Never output markdown or extra text outside the raw JSON object.

Context JSON:
${context}`;

		type NutritionPayload = {
				summaryText?: unknown;
				categories?: unknown;
				potentialGaps?: unknown;
				recommendedAdditions?: unknown;
		};

		const nutritionData = await callAiJson<NutritionPayload>(nutritionPrompt);

		const dealHighlights = narrative ? parseInsightArray(narrative.dealHighlights) : [];

	const heroSummary = narrative && typeof narrative.heroSummary === 'string' ? narrative.heroSummary.trim() : '';
	const overviewCommentary = narrative && typeof narrative.overviewCommentary === 'string' ? narrative.overviewCommentary.trim() : '';
	const kpiCallouts = narrative ? parseKpiCallouts(narrative.kpiCallouts) : [];
	const recommendations = narrative ? parseInsightArray(narrative.recommendations) : [];
	const inventoryAnnotations = narrative ? parseInventoryAnnotations(narrative.inventoryAnnotations) : [];
	const inventorySuggestions = narrative ? parseInsightArray(narrative.inventorySuggestions) : [];
	const parsedPantryNutrition = narrative ? parsePantryNutrition(narrative.pantryNutrition) : null;
	// If the dedicated nutrition rating returned structured data, convert it into PantryNutritionSummary
	if (nutritionData) {
		try {
			const sumText = typeof nutritionData.summaryText === 'string' ? nutritionData.summaryText.trim() : parsedPantryNutrition?.macroBalance ?? '';
			const cats = Array.isArray(nutritionData.categories) ? nutritionData.categories : [];
			const missing = Array.isArray(nutritionData.potentialGaps) ? nutritionData.potentialGaps.map((s: any) => String(s)) : parsedPantryNutrition?.missingNutrients ?? [];
			const recs = Array.isArray(nutritionData.recommendedAdditions)
				? (nutritionData.recommendedAdditions as any[]).map((r) => ({ item: String(r.item ?? ''), reason: String(r.reason ?? ''), storeSuggestion: r.storeSuggestion ? String(r.storeSuggestion) : undefined, mood: ensureMood((r.mood ?? 'green')) }))
				: parsedPantryNutrition?.recommendedAdditions ?? [];

			const totalScore = cats.reduce((acc: number, c: any) => acc + (typeof c.score === 'number' ? c.score : 0), 0);
			const avgScore = cats.length ? Math.round(totalScore / cats.length) : (parsedPantryNutrition?.nutritionGrid ? Math.round(parsedPantryNutrition.nutritionGrid.reduce((a,b)=>a+b.score,0)/parsedPantryNutrition.nutritionGrid.length) : 72);

			const overallMoodStr = avgScore >= 75 ? 'green' : avgScore >= 45 ? 'amber' : 'red';

			const nutritionGrid = cats.map((c: any) => {
				const score = typeof c.score === 'number' ? c.score : 0;
				const moodStr = score >= 75 ? 'green' : score >= 45 ? 'amber' : 'red';
				return { id: String(c.id ?? ''), label: String(c.label ?? ''), score, mood: ensureMood(moodStr) };
			});

			const aiPantryNutrition: PantryNutritionSummary = {
				macroBalance: sumText || (parsedPantryNutrition?.macroBalance ?? ''),
				missingNutrients: missing as string[],
				recommendedAdditions: recs as any,
				overallMood: ensureMood(overallMoodStr),
				nutritionGrid: nutritionGrid as any,
			};

			return {
				heroSummary: heroSummary || fallback.heroSummary,
				overviewCommentary: overviewCommentary || fallback.overviewCommentary,
				kpiCallouts: kpiCallouts.length ? kpiCallouts : fallback.kpiCallouts,
				recommendations: recommendations.length ? recommendations : fallback.recommendations,
				inventoryAnnotations: inventoryAnnotations.length ? inventoryAnnotations : fallback.inventoryAnnotations,
				inventorySuggestions: inventorySuggestions.length ? inventorySuggestions : fallback.inventorySuggestions,
				pantryNutrition: aiPantryNutrition,
				dealHighlights: dealHighlights.length ? dealHighlights : fallback.dealHighlights,
				mealPlan: mealPlan.length ? mealPlan : fallback.mealPlan,
				dietSchedule: dietSchedule.length ? dietSchedule : fallback.dietSchedule,
			};
		} catch (err) {
			console.warn('[ai] failed to map nutritionData to PantryNutritionSummary', err);
			// fall through to returning earlier mapping
		}
	}

	return {
		heroSummary: heroSummary || fallback.heroSummary,
		overviewCommentary: overviewCommentary || fallback.overviewCommentary,
		kpiCallouts: kpiCallouts.length ? kpiCallouts : fallback.kpiCallouts,
		recommendations: recommendations.length ? recommendations : fallback.recommendations,
		inventoryAnnotations: inventoryAnnotations.length ? inventoryAnnotations : fallback.inventoryAnnotations,
		inventorySuggestions: inventorySuggestions.length ? inventorySuggestions : fallback.inventorySuggestions,
		pantryNutrition: parsedPantryNutrition ?? fallback.pantryNutrition,
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

/**
 * src/server/types.ts
 * Shared TypeScript types for backend helper modules (payloads, model records, roles).
 */

export type Role = 'buyer' | 'seller';

export interface LoginPayload {
	email: string;
	password: string;
	role: Role;
}

export interface SignupPayload extends LoginPayload {
	displayName?: string;
}

export interface UserRecord extends LoginPayload {
	id: string;
	displayName: string;
}

export type InventoryStatus = 'healthy' | 'use-soon' | 'restock' | 'overflow';

export type MoodColor = 'green' | 'amber' | 'red';

export interface HighlightedInsight {
	keyword: string;
	mood: MoodColor;
	detail: string;
}

export interface BuyerInventoryItem {
	id: string;
	name: string;
	quantity: number;
	unit: string;
	category: string;
	status: InventoryStatus;
	addedOn: string;
	expirationDate?: string;
	daysLeft?: number;
	estimatedValue?: number;
	notes?: string;
}

export interface BuyerInventoryInput {
	userId: string;
	name: string;
	quantity: number;
	unit: string;
	category: string;
	expirationDate?: string;
	estimatedValue?: number;
}

export interface BuyerPurchaseRecord {
	id: string;
	date: string;
	total: number;
	store: string;
	items: Array<{
		name: string;
		quantity: number;
		unit: string;
		category: string;
	}>;
}

export interface BuyerEventPlan {
	id: string;
	name: string;
	date: string;
	headcount: number;
	menu: string[];
	status: 'on-track' | 'needs-shopping' | 'draft';
	shoppingList: Array<{
		name: string;
		quantity: number;
		unit: string;
		status: 'covered' | 'add' | 'reserve';
	}>;
}

export interface BuyerProfile {
	userId: string;
	displayName: string;
	zip: string;
	householdSize: number;
	dietaryPreferences: string[];
	activityLevel?: string;
	budgetPerWeek: number;
	calorieTarget?: number;
	goals: {
		reduceWaste: number;
		saveBudget: number;
		eatHealthy: number;
	};
	inventory: BuyerInventoryItem[];
	purchases: BuyerPurchaseRecord[];
	events: BuyerEventPlan[];
	lastUpdated: string;
}

export interface StoreOffer {
	id: string;
	zip: string;
	storeName: string;
	category: string;
	description: string;
	discountPercent: number;
	validThrough: string;
	items: string[];
	type: 'bundle' | 'markdown' | 'loyalty';
}

export interface MealPlanSuggestion {
	day: string;
	meals: HighlightedInsight[];
	addOns?: HighlightedInsight[];
}

export interface DietScheduleSuggestion {
	day: string;
	focus: HighlightedInsight;
	tip: HighlightedInsight;
}

export interface BuyerAiInsights {
	summary: HighlightedInsight[];
	recommendedActions: HighlightedInsight[];
	inventorySuggestions: HighlightedInsight[];
	mealPlan: MealPlanSuggestion[];
	dietSchedule: DietScheduleSuggestion[];
	dealHighlights: HighlightedInsight[];
}

export interface BuyerDashboardMetrics {
	wasteRisk: number;
	pantryHealth: number;
	budgetHealth: number;
	eventReadiness: number;
}

export interface BuyerDashboardData {
	profile: BuyerProfile;
	metrics: BuyerDashboardMetrics;
	ai: BuyerAiInsights;
	offers: StoreOffer[];
	emptyInventory: boolean;
	shoppingFocus: string[];
}

export interface SellerInventoryItem {
	sku: string;
	name: string;
	category: string;
	stock: number;
	parLevel: number;
	daysOnHand: number;
	status: 'healthy' | 'risk' | 'critical';
	spoilageRisk: number;
	margin: number;
}

export interface SellerDemandSignal {
	id: string;
	zip: string;
	startDate: string;
	endDate: string;
	expectedLift: number;
	focusItems: string[];
}

export interface SellerPromotionIdea {
	id: string;
	name: string;
	status: 'draft' | 'active' | 'recommended';
	channel: 'app' | 'in-store' | 'flyer';
	discount: string;
	focusItems: string[];
}

export interface SellerProfile {
	userId: string;
	displayName: string;
	store: {
		name: string;
		zip: string;
		region: string;
		format: 'grocery' | 'market' | 'warehouse';
	};
	goals: {
		reduceSpoilage: number;
		increaseSellThrough: number;
		growBundles: number;
	};
	inventory: SellerInventoryItem[];
	demandSignals: SellerDemandSignal[];
	promotions: SellerPromotionIdea[];
	nearbyBuyerInsights: Array<{
		zip: string;
		upcomingEvents: number;
		topItems: string[];
	}>;
	salesPerformance: Array<{
		weekOf: string;
		revenue: number;
		grossMargin: number;
		wasteAvoided: number;
	}>;
	lastUpdated: string;
}

export interface SellerAiInsights {
	summary: HighlightedInsight[];
	recommendedActions: HighlightedInsight[];
	bundleIdeas: HighlightedInsight[];
	restockAlerts: HighlightedInsight[];
}

export interface SellerDashboardMetrics {
	sellThrough: number;
	spoilageRisk: number;
	promotionMomentum: number;
	demandConfidence: number;
}

export interface SellerDashboardData {
	profile: SellerProfile;
	metrics: SellerDashboardMetrics;
	ai: SellerAiInsights;
	offers: StoreOffer[];
	emptyInventory: boolean;
}

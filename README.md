# Wakefern Marketplace — Project Specification

This document describes the Wakefern Marketplace concept: a two-sided inventory management and marketplace platform focused on reducing food waste and improving margins for both Buyers (households, event planners) and Sellers (grocery stores, local suppliers). It is a product-spec / feature-spec intended to guide development, prototypes, and hackathon demos. It deliberately focuses on the product idea, user experiences, features, and concrete examples — implementation and framework choices are intentionally excluded.

## Elevator pitch

Wakefern Marketplace helps households track what they already own, plan events and meals, and buy just what they need—while giving nearby sellers demand foresight, spoilage risk alerts, and targeted promotion opportunities. The platform connects buyer plans and pantry data to seller forecasting so both sides waste less and earn/ save more.

## Key goals

- Reduce household food waste by surfacing expiring items and integrating them into meal plans and shopping lists.
- Reduce sellers' overstock and spoilage through demand signals (buyer events/plans) and localized trend analytics.
- Make shopping frictionless: let buyers create smart shopping lists, shop for pickup/delivery, and find store aisle & expiry-aware recommendations.
- Drive seller revenue with promotions and targeted marketplace placement informed by buyer plans.

## Actors & roles

- Buyer: a household member, event planner, or community user who manages pantry inventory, plans meals/events, and shops via the marketplace.
- Seller: a store or supplier listing product offerings, viewing demand forecasts, and managing stock/promotions.
- Admin / Platform: manages onboarding, marketplace rules, and compliance.

## Buyer-side features (detailed)

1. Profile & preferences
	- Household information (members, typical servings, dietary restrictions, budget targets).
	- Location (zipcode) and preferred stores.
	- Notification preferences (expiring items, meal suggestions, price drops).

2. Pantry / Inventory dashboard
	- List of current items with quantity, unit (e.g., 1.5 kg, 2 packs), location (fridge/pantry), and expiration/best-before date.
	- Add items via manual entry, barcode lookup, or receipt import. (For early prototypes, manual add is sufficient.)
	- Visual sorting and filters: expiring soon, low stock, most-used, category.
	- Automatic suggestions to merge duplicates and normalize units (cup ↔ grams hints).

3. Purchase history & budget tracking
	- Weekly and monthly spend summaries; per-category breakdown (produce, dairy, packaged goods).
	- Simple budget planner and alerts when purchase pace exceeds budget.

4. Event planner & shopping lists
	- Create events (date, location, headcount, meal types). Attach recipes or menu items.
	- Auto-generate shopping list from event menus and current pantry — includes required quantities and suggestions to reuse existing items before they expire.
	- Smart consolidation across multiple events (if two events are within the same date range, combine lists and reduce duplicates).

5. Meal planning & health assistant
	- Create weekly/monthly meal plans aligned to dietary goals (e.g., low sodium, vegetarian) and constraints (budget, allergies).
	- Turn meal plans into prioritized shopping lists that minimize waste by using items already in pantry first.

6. Shopping flows
	- Search marketplace/catalog and add items to cart or reserve for in-store pickup.
	- View product details that include: typical shelf life, recommended use-by windows, and aisle location in partner stores.
	- Checkout flows can be mocked in early versions; focus is on list generation & product discovery.

7. Community & sharing
	- Post recipes, leftover hacks, or local swap offers to a community feed.
	- Share event shopping lists with other household members.

8. Alerts & recommendations
	- Expiry alerts with suggested recipes to use items before they go bad.
	- Bundled recommendations (e.g., buy these three together for a meal and save).

### Buyer example scenario

Alice has milk (expires in 3 days), eggs (10 left), and spinach (expires in 2 days). She creates a Thanksgiving event for 8 people in 10 days. The system:
- Detects perishables expiring soon and suggests recipes that use milk, spinach, and eggs within the next 3 days.
- For the Thanksgiving menu, generates a consolidated shopping list that reuses pantry items, suggests exact quantities, and flags which items should be purchased closer to the event date (e.g., turkey vs. herbs).
- Produces a prioritized shopping list that fits Alice's budget and highlights items available for pickup at her preferred store.

## Seller-side features (detailed)

1. Seller profile & store data
	- Store name, location(s), aisle mapping, supplier contacts, and configured categories.

2. Sales & demand dashboard
	- Historical sales, current stock levels (manual or POS-integrated), and top/bottom SKUs.
	- Region/zip-level demand heatmaps derived from buyer plans and historical purchases.

3. Event-driven demand signals
	- Alerts for upcoming local demand spikes (e.g., many buyers in zip 07030 creating Thanksgiving events) with likely product needs and quantities.
	- Calendar view of predicted upcoming demand windows.

4. Inventory recommendations & spoilage risk
	- Recommend reorder timing and quantities based on projected demand and item shelf life.
	- Highlight at-risk products (high spoilage probability) and recommended actions: markdown, promotion, donation.

5. Promotions & subscription boosts
	- Paid/opt-in promotions to boost product placement in buyer search results or event suggestions.
	- Campaign builder: discount campaigns targeted by zip, date range, or buyer dietary segments.

6. Trend discovery & new products
	- Suggest new products based on success at other stores and demographic signals.

7. Integrations (future)
	- POS/ERP sync for stock automation, supplier ordering, and sales telemetry.

### Seller example scenario

Fresh Grocer in zip 07030 sees a cluster of buyers in nearby neighborhoods planning Thanksgiving events and a spike in planned purchases of sweet potatoes and cranberries for the first three weeks of November. The platform:
- Predicts a 30% increase in demand for those SKUs and recommends an additional order of X units arriving 3 days before the peak date.
- Flags an at-risk SKU (fresh herbs) with high current stock and suggests a two-day targeted discount to prevent spoilage.
- Offers Fresh Grocer an optional promotion to appear first for buyers in the area that are planning Thanksgiving menus.

## Cross-cutting features & AI-driven helpers

- Meal-plan generator: uses pantry, dietary profile, and calendar to output daily menus and shopping lists.
- Smart consolidation: deduplicate items across events and shopping lists, normalize units, and prioritize expiring inventory.
- Forecasting signals: aggregate anonymized buyer plans to create short-term local forecasts for sellers.
- Privacy-first design: buyer plans can be anonymized and aggregated before being exposed to sellers; opt-in controls for sharing planning data.

## Concrete data & UI examples (for clarity)

- Inventory item example:

  - name: "Whole Milk"
  - qty: 1
  - unit: "carton (1L)"
  - location: "fridge"
  - expiration_date: 2025-10-07

- Event example:

  - name: "Birthday Brunch"
  - date: 2025-10-12
  - headcount: 12
  - menu: ["quiche", "fruit salad", "coffee"]
  - derived_shopping_list: [{item: "eggs", qty: 18}, {item: "spinach", qty: 0.5, unit: "kg"}]

- Seller forecast example:

  - zip: 07030
  - sku: "cranberries-250g"
  - predicted_demand_window: 2025-11-20 → 2025-11-27
  - predicted_quantity: 480
  - confidence: 0.78

## Edge cases & practical considerations

- New user / empty pantry: provide an onboarding checklist and starter shopping lists.
- Unit mismatches: allow manual unit mapping and provide conversion hints (cups ↔ grams) for common items.
- Overlapping events: intelligently consolidate shopping lists and recommend batch purchases.
- Cancellations & changes: provide easy event edits and automatic refunds or adjustments if orders are placed (depending on store policies).
- Data freshness: encourage frequent inventory updates (barcode scan, quick add) and provide clear UI affordances for manual overrides.

## Metrics to measure success (examples)

- Reduction in predicted household waste for seeded users (%)
- Average cost saved per buyer per month
- Increase in seller inventory turns for participating stores
- Conversion rate of planned shopping lists → actual purchases

## Hackathon demo ideas (quick)

- Showcase buyer flow: add pantry items → create event → generate shopping list that reuses pantry items first.
- Showcase seller flow: view a local demand spike and the recommended reorder quantity.
- Emphasize the value: show before/after mock stats that illustrate waste reduction and better stock planning.

## Next steps (suggested, optional)

- Create seeded sample accounts (1 buyer, 1 seller) and sample data to drive a short demo script.
- Define a minimal API contract and a tiny data seed file for the hackathon prototype.

---

This README is a living product specification: expand it with UI wireframes, sample data exports, and prioritized MVP tasks as you move from planning to implementation.

--

Quick start notes (single Astro workspace):

- From repo root run (assuming Node ≥18 and npm are installed):

	1. npm install
	2. npm run dev

These commands launch the Astro dev server with both UI pages and the `/api/login` endpoint.

Demo credentials for the prototype routes:

- Buyer — `buyer@example.com` / `buyer123`
- Seller — `seller@example.com` / `seller123`

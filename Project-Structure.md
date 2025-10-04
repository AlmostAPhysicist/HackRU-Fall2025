
# Project structure for Wakefern Marketplace (Astro)

This document decomposes the Wakefern Marketplace product into a clear folder and file layout tuned for an Astro frontend and a small backend API. It is intentionally broken into many small files and narrow responsibilities so you can implement, test, and iterate on pieces independently.

Guidelines used here:
- Prefer many small files over large monoliths.
- Each file below has a short commented purpose and how it interacts with other files (no code, only description).
- The layout separates concerns: `apps/www` (Astro frontend), `apps/api` (backend), `packages/shared` (types and helpers), `infra`, `data`, and `docs`.

Use this as a living map. Implement files incrementally and keep comments updated when you add real code.

---

## Top-level folders (overview)

- `apps/www/` — Astro site (frontend UI, pages, components, static assets)
- `apps/api/` — Backend REST/GraphQL service(s) or serverless functions
- `packages/shared/` — Shared TypeScript types, validation rules, small utilities
- `data/` — seed data, fixtures, and sample CSVs/JSON used for demos
- `infra/` — infrastructure as code, deployment scripts, Docker compose, CI
- `docs/` — design docs, wireframes, demo scripts, legal notes
- `tests/` — end-to-end and integration test harnesses

---

PART I — Frontend (Astro)

The frontend is organized as an Astro project inside `apps/www/`. It contains small components, layout files, pages, and a local `data/` folder for mocks. Each file below includes a short description (as a comment) and how it connects to other files.

- apps/www/

	- `astro.config.mjs`
		- // Purpose: Astro config for project. Interacts with build and integrations (e.g., Tailwind, image plugin).

	- `package.json`
		- // Purpose: Frontend dependencies and scripts (dev, build, preview). Invokes Astro dev server.

	- `public/`
		- // Purpose: Static assets (favicon, robots.txt, store maps). Used by pages and components via absolute paths.

	- `src/`
		- // Purpose: All frontend source files (pages, components, layouts, styles).

		- `src/pages/`
			- `index.astro`
				- // Purpose: Landing page with value proposition and demo links. Links to `src/components/Hero.*` and `src/pages/demo/*`.
			- `login.astro`
				- // Purpose: Login / signup page (email). Interacts with `src/components/Auth/*` and calls API endpoints in `apps/api/`.
			- `profile.astro`
				- // Purpose: Buyer profile and preferences editor. Uses `src/components/Profile/*` and shared types.
			- `pantry/` (folder)
				- `index.astro`
					- // Purpose: Pantry dashboard page listing `InventoryItemCard` components and expiry widgets.
				- `add.astro`
					- // Purpose: Entry UI for adding items (manual form). Uses `src/components/Forms/InventoryForm`.
			- `planner/` (folder)
				- `index.astro`
					- // Purpose: Planner overview (events + meal plan calendar). Integrates with `src/components/Planner/*`.
				- `event/[id].astro`
					- // Purpose: Event detail page (shopping list, attendees). Fetches event data from `apps/api/`.
			- `marketplace/` (folder)
				- `index.astro`
					- // Purpose: Product catalog and search page. Uses `src/components/Catalog/*` and calls `apps/api` search endpoints.
				- `product/[id].astro`
					- // Purpose: Product details including aisle & shelf-life metadata.
			- `seller/` (folder)
				- `dashboard.astro`
					- // Purpose: Seller dashboard landing with KPIs. Pulls aggregated forecasts from `apps/api`.

		- `src/components/`
			- `ui/` (reusable UI primitives)
				- `Button.tsx`
					- // Purpose: Generic button with variants. Used across pages and components.
				- `Input.tsx`
					- // Purpose: Generic input control with validation messages.
				- `Modal.tsx`
					- // Purpose: Reusable modal wrapper for small dialogs (add item, confirm delete).
				- `Icon/*`
					- // Purpose: Small SVG icon components used across UI.
			- `layout/`
				- `MainLayout.astro`
					- // Purpose: App shell (header, nav, footer). Wraps pages and injects `Auth` state.
				- `DashboardLayout.astro`
					- // Purpose: Two-column layout used by buyer/seller dashboards.
			- `pantry/`
				- `InventoryItemCard.astro`
					- // Purpose: Visual card for an inventory item (name, qty, expiry). Emits events to update qty.
				- `ExpiryBadge.astro`
					- // Purpose: Small badge component showing days-until-expire and color coding.
			- `planner/`
				- `EventCard.astro`
					- // Purpose: Compact summary of an event (date, headcount, actionable buttons).
				- `ShoppingList.astro`
					- // Purpose: Renders derived shopping list, shows which items are in pantry and recommended buy dates.
			- `catalog/`
				- `ProductCard.astro`
					- // Purpose: Single product listing used on catalog results. Integrates with `Cart` and `Promotions` components.
				- `Filters.astro`
					- // Purpose: Filter controls for catalog search (price, distance, freshness).
			- `auth/`
				- `LoginForm.tsx`
					- // Purpose: Email + password form that calls `apps/api/auth` endpoints.
				- `OtpForm.tsx`
					- // Purpose: Optional OTP / magic link handling component.
			- `seller/`
				- `KpiCard.astro`
					- // Purpose: Small KPI tiles used in seller dashboard (predicted demand, spoilage risk).
				- `ForecastChart.astro`
					- // Purpose: Time-series chart for demand predictions. Reads data from `apps/api/forecasts`.

		- `src/layouts/`
			- `BaseHead.astro`
				- // Purpose: Document head partial (meta tags, analytics snippet). Included by `MainLayout`.

		- `src/styles/`
			- `index.css`
				- // Purpose: Global CSS/Tailwind entry. Imported by `src/layouts/BaseHead.astro`.
			- `tokens.css`
				- // Purpose: Design tokens (colors, spacing) used by components.

		- `src/lib/` (frontend helpers)
			- `date.ts`
				- // Purpose: Small date utilities (daysUntilExpire). Used by `ExpiryBadge` and planner pages.
			- `formatting.ts`
				- // Purpose: Number/currency formatting utilities used by product cards and budget UI.
			- `api-client.ts`
				- // Purpose: Lightweight wrapper to call `apps/api` endpoints; centralizes base URL and error handling.

		- `src/data/` (front-end mock fixtures)
			- `seed-buyer.json`
				- // Purpose: Small fixture representing one buyer with pantry and events for local dev.
			- `seed-seller.json`
				- // Purpose: Seller fixture with store aisles and sample SKUs for demo mode.

	- `tests/` (frontend-only unit tests)
		- `components/` — small tests for UI primitives and critical rendering behaviors.

PART II — Backend (apps/api)

Backend is organized to be replaceable (serverless, monolith, or microservice). Files below list small, focused modules. Each file's comment explains its responsibility and connections.

- apps/api/

	- `package.json`
		- // Purpose: Backend dependencies and scripts (dev, start, test).

	- `src/`
		- // Purpose: Backend source code (API routes, services, workers).

		- `src/server.ts`
			- // Purpose: Entrypoint for local server. Wire up routes and middleware. Uses `src/routes/*` modules.

		- `src/routes/`
			- `auth.ts`
				- // Purpose: Login/register endpoints. Calls `src/services/authService`.
			- `inventory.ts`
				- // Purpose: CRUD endpoints for buyer pantry items. Uses `src/services/inventoryService`.
			- `events.ts`
				- // Purpose: Event CRUD and derived shopping-list generation endpoint.
			- `catalog.ts`
				- // Purpose: Product search + listing endpoints used by `apps/www`.
			- `seller.ts`
				- // Purpose: Seller-specific endpoints (dashboards, forecasts, promotions).

		- `src/services/`
			- `authService.ts`
				- // Purpose: Business logic for user creation, token issuance, password reset. Uses `packages/shared/validation`.
			- `inventoryService.ts`
				- // Purpose: Normalize items, unit conversions, expiry logic, and persistence adapters.
			- `plannerService.ts`
				- // Purpose: Given pantry + event data produce prioritized shopping lists and meal plan suggestions. May call AI microservices.
			- `forecastService.ts`
				- // Purpose: Aggregate buyer events and produce short-term SKU forecasts for sellers. Emits jobs to `src/workers` for heavy computation.
			- `catalogService.ts`
				- // Purpose: Search relevance, combine seller listings, and scoring logic (freshness, distance, boost).

		- `src/models/` (database models / ORM layer)
			- `user.model.ts`
				- // Purpose: DB schema mapping for users (buyers/sellers) and basic queries.
			- `inventory.model.ts`
				- // Purpose: Inventory item persistence methods and helper queries, e.g., findExpiringItems.
			- `event.model.ts`
				- // Purpose: Event persistence and queries to find local event clusters.
			- `listing.model.ts`
				- // Purpose: Seller product listing persistence and indexing helpers.

		- `src/workers/`
			- `forecastWorker.ts`
				- // Purpose: Background worker that consumes event streams and computes SKU forecasts. Writes results to `forecasts` table used by seller endpoints.
			- `cleanupWorker.ts`
				- // Purpose: Periodic tasks (expire old notifications, run stale-data compactions).

		- `src/lib/`
			- `unit-conversions.ts`
				- // Purpose: Central place for unit conversion functions (cups <-> grams, oz <-> g). Used by inventoryService.
			- `scoring.ts`
				- // Purpose: Ranking and scoring utilities for marketplace results.
			- `privacy-utils.ts`
				- // Purpose: Functions to aggregate/anonymize buyer plan data before exposing to sellers.

		- `src/config/`
			- `env.example.ts`
				- // Purpose: Template environment variables for DB url, API keys, and AI endpoint opt-ins.

		- `src/db/`
			- `migrations/`
				- // Purpose: SQL or ORM migrations to define tables used by `src/models`.

	- `docker-compose.yml`
		- // Purpose: Compose file for Postgres + Redis + backend service for local dev.

PART III — Shared packages (packages/shared)

Small, dependency-free code and types that both frontend and backend can import.

- packages/shared/

	- `package.json`
		- // Purpose: Defines shared package; built and consumed by `apps/www` and `apps/api` through workspace references.

	- `src/types/`
		- `index.ts`
			- // Purpose: Canonical TypeScript types for `User`, `InventoryItem`, `Event`, `Listing`, `Forecast`.
		- `api-contracts.ts`
			- // Purpose: Shared API request/response shapes used when composing clients and tests.

	- `src/validation/`
		- `inventory.schema.ts`
			- // Purpose: JSON schema or Zod schemas describing item shapes and validation rules used by both frontend forms and backend services.

	- `README.md`
		- // Purpose: Notes on how to use this shared package and versioning rules.

PART IV — Data & seeds (data/)

Small fixtures and seed scripts for demos and testing.

- data/
	- `seed/`
		- `buyer-seed.json`
			- // Purpose: Example buyer with pantry items and events used in `apps/www` demo mode and backend seeds.
		- `seller-seed.json`
			- // Purpose: Example seller with aisles and listings.
		- `large-sample.csv`
			- // Purpose: Optional larger sample of SKUs to test catalog search performance.
	- `scripts/`
		- `apply-seed.ts`
			- // Purpose: Script to insert seed data into the local dev DB. Calls `apps/api` or writes directly to DB.

PART V — Infra (infra/)

Keep deployment configs and infra code here.

- infra/
	- `docker/`
		- `Dockerfile.api`
			- // Purpose: Backend image definition for local or production container builds.
		- `Dockerfile.www`
			- // Purpose: Frontend image for static build output.
	- `compose/`
		- `dev.yml`
			- // Purpose: Docker Compose dev overrides for testing the full stack.
	- `ci/`
		- `github-actions/`
			- `build.yml`
				- // Purpose: CI pipeline for lint, test, build, and deploy steps.

PART VI — Docs & design (docs/)

- docs/
	- `wireframes/`
		- // Purpose: PNGs/SVGs or short notes mapping key screens to components.
	- `demo-script.md`
		- // Purpose: Step-by-step demo script used at HackRU for a 3–5 minute pitch. References `data/seed` accounts.
	- `product-spec.md`
		- // Purpose: Expanded product spec (can replicate parts of README) and acceptance criteria for MVP.

PART VII — Tests (tests/)

- tests/
	- `e2e/`
		- `buyer-happy-path.spec.ts`
			- // Purpose: End-to-end test that runs add pantry -> create event -> generate shopping list -> view seller forecast. Uses seeded data from `data/seed`.
		- `seller-onboarding.spec.ts`
			- // Purpose: E2E test for seller signup and dashboard view.
	- `unit/`
		- `planner.spec.ts`
			- // Purpose: Unit tests for shopping-list generation logic (can run against `packages/shared` validation and small pure functions).

PART VIII — Demo harness & scripts

- `scripts/`
	- `run-demo.ps1`
		- // Purpose: PowerShell script to start Docker compose, seed the DB, and open demo urls (for Windows dev machines). Uses `data/scripts/apply-seed.ts`.
	- `smoke-test.js`
		- // Purpose: Lightweight node script that calls a few endpoints to assert the stack is healthy.

PART IX — File-by-file: small examples (pick-list of many small files you may want to create first)

- Frontend component ideas (each should be one file):
	- `src/components/ui/Badge.tsx` — // small badge used for expiry and tags
	- `src/components/ui/Toast.tsx` — // transient notifications
	- `src/components/Forms/InventoryForm.tsx` — // add/edit pantry item form
	- `src/components/Planner/MealCard.tsx` — // a meal card showing recipe + pantry match
	- `src/components/Shared/ConfirmDialog.tsx` — // confirmation modal

- Backend service ideas (each its own file):
	- `src/services/unitConversion.ts` — // conversion helpers and mapping table
	- `src/services/expiryScorer.ts` — // compute spoilage risk for items
	- `src/services/shoppingListComposer.ts` — // transforms menu + pantry -> prioritized shopping list

PART X — Interaction notes & contracts (how parts connect)

- Frontend pages call backend endpoints via `src/lib/api-client.ts` in `apps/www`.
- Backend services write/read canonical shapes defined in `packages/shared/src/types`.
- Background workers read events from DB or queue (Redis) and write forecasts to `forecasts` table; seller dashboard requests `GET /seller/forecasts`.
- Seed scripts write to DB, which both frontend (in dev mode) and backend tests use.

---

Short-term recommended implementation order (minimal friction):
1. Create `packages/shared` types and validation schemas.
2. Create `apps/api` minimal auth + inventory routes and `apply-seed.ts` script.
3. Scaffold `apps/www` with `index.astro`, `pantry` pages, and components `InventoryItemCard` + `ExpiryBadge` that use `src/data/seed-buyer.json`.
4. Add `run-demo.ps1` and `docker-compose.yml` to iterate quickly.

This file is intentionally dense with small pieces — if you'd like, I can now create the actual empty file skeletons and placeholder comment blocks for the most important subset (for example, scaffold `apps/www/src/components/*` and `apps/api/src/services/*`) so you can start filling them with implementations. Tell me which area to scaffold first (frontend components, backend services, or shared types) and I'll create the files with the commented purposes as described.


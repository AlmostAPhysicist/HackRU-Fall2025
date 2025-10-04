
# Focused project structure for Wakefern Marketplace (Astro)

Everything now lives inside the existing Astro project root. The shared UI layer uses six supporting files, the backend helper layer uses six files, and dedicated pages surface tailored experiences for buyers and sellers.

---

## UI support (7 files)

1. `astro.config.mjs` — Base Astro configuration and hook for integrations.
2. `src/styles/global.css` — Global design tokens, layout primitives, and button styles consumed by every page.
3. `src/layouts/MainLayout.astro` — Application shell with navigation, footer, and bundled global styles.
4. `src/components/ui/Button.astro` — Reusable call-to-action component supporting link and button semantics.
5. `src/components/forms/LoginForm.astro` — Role-aware login form that calls the shared `/api/login` endpoint.
6. `src/components/forms/SignupForm.astro` — Shared sign-up form that posts to `/api/signup` and handles redirects.
7. `src/lib` *(reserved)* — Expand here if another shared helper is absolutely required to stay within the limit.

Pages that consume these helpers:
- `src/pages/index.astro` — Overview landing page linking to buyer and seller flows.
- `src/pages/buyer/login.astro` — Buyer-facing login/sign-up messaging.
- `src/pages/buyer/signup.astro` — Buyer sign-up experience with shared form component.
- `src/pages/seller/login.astro` — Seller-facing login messaging.

---

## Backend helpers (7 files)

1. `src/server/types.ts` — Shared type definitions for roles, payloads, and user records.
2. `src/server/models.ts` — In-memory data access used during the prototype.
3. `src/server/services.ts` — Business logic for authenticating buyers and sellers plus account creation.
4. `src/server/routes.ts` — HTTP handlers that parse requests and invoke services.
5. `src/server/index.ts` — Aggregates exported routes for easy import inside API endpoints.
6. `src/server/env.example.ts` — Reference environment variables for local and deployed setups.
7. `src/server/data/users.json` — Demo datastore seeded with buyer/seller accounts and updated on sign-up.

API endpoint leveraging these helpers:
- `src/pages/api/login.ts` — Astro API route that wires the shared login handler.
- `src/pages/api/signup.ts` — Astro API route that creates new accounts and updates the demo datastore.

---

### Interaction highlights

- Buyer and seller pages mount the shared `LoginForm` component, which posts JSON credentials to `/api/login`.
- The API route reuses the backend helper stack, enabling a clear separation between request parsing, business logic, and persistence.
- `MainLayout.astro` imports global CSS once, keeping page files focused on content instead of structural markup.

---

### Implementation notes

- Update the in-memory dataset in `models.ts` with demo accounts for showcases; the same helpers can later connect to a real database.
- Add additional services or models inside the existing folders to respect the 6–7 file guidance before introducing new directories.
- When new UI needs arise (e.g., dashboards), extend the current components/pages before creating new primitives to keep the footprint lean.


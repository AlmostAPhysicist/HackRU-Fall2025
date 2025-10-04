/**
 * src/server/index.ts
 * Entry point for backend helpers used by Astro API routes.
 * Exposes a minimal router interface that resolves logical handlers defined in `routes.ts`.
 */

import { loginRoute, signupRoute } from './routes';

export const routes = {
	login: loginRoute,
	signup: signupRoute,
};

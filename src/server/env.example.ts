/**
 * src/server/env.example.ts
 * Duplicate this file to `.env` and populate the keys below for local development.
 */

export const ENV_EXAMPLE = {
	DATABASE_URL: 'postgres://username:password@localhost:5432/wakefern',
	SESSION_SECRET: 'replace-me-with-a-secret-key',
	FEATURE_FLAGS: 'buyers,sellers',
};

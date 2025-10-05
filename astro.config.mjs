// @ts-check
import { defineConfig } from 'astro/config';

// Try to load the Netlify adapter if available. Fall back to the Node adapter for local dev
// This avoids crashing `astro dev` when `@astrojs/netlify` hasn't been installed yet.
let adapter;
try {
	// prefer Netlify functions adapter when installed
	// eslint-disable-next-line no-await-in-loop
	const mod = await import('@astrojs/netlify/functions');
	adapter = mod.default({ builders: [] });
	console.log('[astro.config] Using @astrojs/netlify adapter');
} catch (err) {
	// fallback to node adapter (must be present in dependencies)
	const nodeMod = await import('@astrojs/node');
	adapter = nodeMod.default({ mode: 'standalone' });
	console.warn('[astro.config] @astrojs/netlify not found; falling back to @astrojs/node for local dev. Run `npm install` to add the Netlify adapter for deployment.');
}

export default defineConfig({
	output: 'server',
	adapter,
});

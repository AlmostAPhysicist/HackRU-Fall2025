Netlify deployment notes (server routes + secrets)

This repo uses Astro with server-side routes (Node-style). To deploy on Netlify and keep server-side endpoints working, do the following:

1) Install the Netlify adapter locally or in CI

PowerShell (run locally or in your CI pipeline before build):

npm install --save-dev @astrojs/netlify

2) Make sure your `astro.config.mjs` uses the Netlify adapter. Example (already applied):

import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify/functions';

export default defineConfig({
  output: 'server',
  adapter: netlify({ builders: [] }),
});

3) Add environment variables (API keys) in Netlify dashboard

- Go to Site settings -> Build & deploy -> Environment -> Environment variables
- Add:
  - GEMINI_API_KEY (your Gemini or AI provider key)
  - AI_API_KEY (optional fallback)
  - DATABASE_URL (if using a remote DB)
  - SESSION_SECRET

Do NOT commit real keys to the repo. Use the Netlify UI to add production secrets.

4) Ensure Netlify build settings

- Build command: npm run build
- Publish directory: dist

Netlify will detect the functions in `dist/functions` created by the adapter and wire them as serverless functions.

5) If you accidentally committed a `.env` with secrets, rotate those keys immediately.

6) Local testing

- To build locally and test the Node output:
  npm run build
  npm run preview


If you'd like, I can:
- Add a small script to detect committed `.env` files during pre-commit (husky) and block them.
- Add a short GitHub Actions workflow that installs dev deps, builds, and deploys to Netlify (using Netlify CLI or the Netlify GitHub integration).

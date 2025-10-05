import { GoogleGenAI } from '@google/genai';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function readEnvFileValue(keys) {
	try {
		const envPath = join(process.cwd(), '.env');
		const raw = readFileSync(envPath, 'utf-8');
		for (const line of raw.split(/\r?\n/)) {
			if (!line || line.trim().startsWith('#')) continue;
			const [key, ...rest] = line.split('=');
			if (!key || rest.length === 0) continue;
			const value = rest.join('=').trim();
			if (keys.includes(key.trim()) && value.length > 0) {
				return value;
			}
		}
	} catch (error) {
		if (error.code !== 'ENOENT') {
			console.warn('Unable to read .env file:', error.message);
		}
	}
	return null;
}

function resolveEnvValue(primaryKeys, fallbackKeys = []) {
	for (const key of primaryKeys) {
		const value = process.env[key];
		if (typeof value === 'string' && value.length > 0) {
			return value;
		}
	}

	if (fallbackKeys.length === 0) {
		return readEnvFileValue(primaryKeys);
	}

	const value = readEnvFileValue([...primaryKeys, ...fallbackKeys]);
	if (value) {
		return value;
	}

	for (const key of fallbackKeys) {
		const envValue = process.env[key];
		if (typeof envValue === 'string' && envValue.length > 0) {
			return envValue;
		}
	}

	return null;
}

async function extractText(response) {
	if (!response || typeof response !== 'object') {
		return null;
	}

	const textFn = response.text;
	if (typeof textFn === 'function') {
		const value = textFn.call(response);
		const resolved = typeof value?.then === 'function' ? await value : value;
		if (typeof resolved === 'string' && resolved.trim().length > 0) {
			return resolved.trim();
		}
	}

	const candidates = response.response?.candidates ?? response.candidates ?? [];
	for (const candidate of candidates) {
		const parts = candidate?.content?.parts;
		if (!Array.isArray(parts)) continue;
		const combined = parts
			.map((part) => (typeof part?.text === 'string' ? part.text : ''))
			.join('')
			.trim();
		if (combined.length > 0) {
			return combined;
		}
	}

	return null;
}

async function main() {
	const apiKey = resolveEnvValue(['GEMINI_API_KEY'], ['AI_API_KEY']);
	if (!apiKey) {
		console.error('Set GEMINI_API_KEY (or AI_API_KEY) in your shell or .env file before running this script.');
		process.exitCode = 1;
		return;
	}

	const model = resolveEnvValue(['GEMINI_MODEL']) ?? 'gemini-2.5-flash';
	const ai = new GoogleGenAI({ apiKey });

	const response = await ai.models.generateContent({
		model,
		contents: [
			{
				role: 'user',
				parts: [{ text: 'Who are you?' }],
			},
		],
		config: {
			temperature: 0.2,
			maxOutputTokens: 1024,
		},
	});

	const text = await extractText(response);
	const outputPath = join(process.cwd(), 'gemini-output.txt');
	if (text) {
		const message = `Gemini says: ${text}`;
		console.log(message);
		writeFileSync(outputPath, `${message}\n`, 'utf-8');
	} else {
		const fallbackMessage = 'No text returned. See gemini-output.txt for raw response.';
		console.warn(fallbackMessage);
		writeFileSync(outputPath, JSON.stringify(response, null, 2), 'utf-8');
	}
}

main().catch((error) => {
	console.error('Gemini request failed:', error);
	process.exitCode = 1;
});

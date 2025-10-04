/**
 * src/server/routes.ts
 * Centralised HTTP route handlers invoked by Astro API endpoints.
 * Each handler performs request parsing before delegating to the service layer.
 */

import type { LoginPayload, SignupPayload } from './types';
import { authenticateUser, registerUser } from './services';

export async function loginRoute(request: Request) {
	const body = await safeParseJson<LoginPayload>(request);

	if ('error' in body) {
		return new Response(JSON.stringify({ error: body.error }), {
			status: 400,
			headers: { 'content-type': 'application/json' },
		});
	}

	const result = await authenticateUser(body);

	if (!result.ok) {
		return new Response(JSON.stringify({ error: result.error }), {
			status: 401,
			headers: { 'content-type': 'application/json' },
		});
	}

	const redirectTo = `/${result.user.role}/dashboard?user=${result.user.id}`;

	return new Response(
		JSON.stringify({
			message: `Welcome back, ${result.user.displayName}!`,
			role: result.user.role,
			userId: result.user.id,
			displayName: result.user.displayName,
			redirectTo,
		}),
		{
			status: 200,
			headers: { 'content-type': 'application/json' },
		},
	);
}

export async function signupRoute(request: Request) {
	const body = await safeParseJson<SignupPayload>(request);

	if ('error' in body) {
		return new Response(JSON.stringify({ error: body.error }), {
			status: 400,
			headers: { 'content-type': 'application/json' },
		});
	}

	const result = await registerUser(body);

	if (!result.ok) {
		const status = result.error.includes('already exists') ? 409 : 400;
		return new Response(JSON.stringify({ error: result.error }), {
			status,
			headers: { 'content-type': 'application/json' },
		});
	}

	const redirectTo = `/${result.user.role}/dashboard?user=${result.user.id}`;

	return new Response(
		JSON.stringify({
			message: `Welcome aboard, ${result.user.displayName}!`,
			role: result.user.role,
			userId: result.user.id,
			displayName: result.user.displayName,
			redirectTo,
		}),
		{
			status: 201,
			headers: { 'content-type': 'application/json' },
		},
	);
}

async function safeParseJson<T>(request: Request): Promise<T | { error: string }> {
	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('application/json')) {
		return { error: 'Expected application/json payload.' };
	}

	try {
		const text = await request.text();
		if (!text.trim()) {
			return { error: 'Request body was empty.' };
		}
		return JSON.parse(text) as T;
	} catch (error) {
		console.error('Failed to parse JSON payload', error);
		return { error: 'Invalid JSON payload' };
	}
}

/**
 * src/server/services.ts
 * Domain logic for authentication, delegating persistence to the model layer.
 */

import type { LoginPayload } from './types';
import { findUserByEmail } from './models';

interface AuthSuccess {
	ok: true;
	user: {
		id: string;
		displayName: string;
		role: 'buyer' | 'seller';
	};
}

interface AuthFailure {
	ok: false;
	error: string;
}

export async function authenticateUser(payload: LoginPayload): Promise<AuthSuccess | AuthFailure> {
	const { email, password, role } = payload;

	if (!email || !password) {
		return { ok: false, error: 'Email and password are required.' };
	}

	if (role !== 'buyer' && role !== 'seller') {
		return { ok: false, error: 'Unsupported account role.' };
	}

	const user = await findUserByEmail(email);

	if (!user || user.role !== role) {
		return { ok: false, error: 'No account matches those credentials.' };
	}

	if (user.password !== password) {
		return { ok: false, error: 'Incorrect password.' };
	}

	return {
		ok: true,
		user: {
			id: user.id,
			displayName: user.displayName,
			role: user.role,
		},
	};
}

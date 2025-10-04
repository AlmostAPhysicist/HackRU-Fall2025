/**
 * src/server/models.ts
 * Simplified in-memory data access layer used by services during the hackathon prototype.
 */

import type { Role, UserRecord } from './types';

const USERS: UserRecord[] = [
	{
		id: 'buyer-001',
		email: 'buyer@example.com',
		password: 'buyer123',
		displayName: 'Buyer Beta',
		role: 'buyer',
	},
	{
		id: 'seller-001',
		email: 'seller@example.com',
		password: 'seller123',
		displayName: 'Seller Sigma',
		role: 'seller',
	},
];

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
	return USERS.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export async function createUser(email: string, password: string, role: Role): Promise<UserRecord> {
	const newUser: UserRecord = {
		id: `${role}-${crypto.randomUUID()}`,
		email,
		password,
		displayName: email.split('@')[0] ?? 'New user',
		role,
	};

	USERS.push(newUser);
	return newUser;
}

/**
 * src/server/models.ts
 * Simplified persistence layer backed by a JSON file for hackathon demos.
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { Role, UserRecord } from './types';

const DATA_FILE = new URL('./data/users.json', import.meta.url);

async function readUsers(): Promise<UserRecord[]> {
	try {
		const data = await readFile(DATA_FILE, 'utf-8');
		return JSON.parse(data) as UserRecord[];
	} catch (error) {
		console.error('Unable to read users file', error);
		return [];
	}
}

async function writeUsers(users: UserRecord[]): Promise<void> {
	await writeFile(DATA_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
	const users = await readUsers();
	return users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export async function createUser(
	email: string,
	password: string,
	role: Role,
	displayName?: string,
): Promise<UserRecord> {
	const users = await readUsers();

	const newUser: UserRecord = {
		id: `${role}-${crypto.randomUUID()}`,
		email,
		password,
		displayName: displayName?.trim() || email.split('@')[0] || 'New user',
		role,
	};

	users.push(newUser);
	await writeUsers(users);
	return newUser;
}

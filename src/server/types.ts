/**
 * src/server/types.ts
 * Shared TypeScript types for backend helper modules (payloads, model records, roles).
 */

export type Role = 'buyer' | 'seller';

export interface LoginPayload {
	email: string;
	password: string;
	role: Role;
}

export interface UserRecord extends LoginPayload {
	id: string;
	displayName: string;
}

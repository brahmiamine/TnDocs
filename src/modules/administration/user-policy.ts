import { z } from 'zod';
export const userRoles = ['user', 'moderator', 'admin'] as const;
export const userStatuses = ['pending_verification', 'active', 'suspended'] as const;
export const userAccessSchema = z.object({ expectedRole: z.enum(userRoles), expectedStatus: z.enum(userStatuses), role: z.enum(userRoles), status: z.enum(userStatuses) }).strict();
export type UserRole = typeof userRoles[number]; export type UserStatus = typeof userStatuses[number];
export type UserAccess = { id: string; role: UserRole; status: UserStatus; emailVerifiedAt: Date | null };
export function validateUserAccessChange(actorId: string, target: UserAccess, next: { role: UserRole; status: UserStatus }, activeAdminCount: number) {
  if (actorId === target.id && next.status !== 'active') return 'SELF_SUSPENSION_FORBIDDEN';
  if (target.role === 'admin' && target.status === 'active' && (next.role !== 'admin' || next.status !== 'active') && activeAdminCount <= 1) return 'LAST_ACTIVE_ADMIN';
  if (next.status === 'active' && !target.emailVerifiedAt) return 'EMAIL_NOT_VERIFIED';
  return null;
}

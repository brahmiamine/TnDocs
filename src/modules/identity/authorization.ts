import { getCurrentUser } from "./service";

const roleRank = { user: 0, moderator: 1, admin: 2 } as const;
export type AppRole = keyof typeof roleRank;

export async function userHasRole(minimumRole: AppRole) {
  const user = await getCurrentUser();
  if (!user) return { user: null, reason: "unauthenticated" as const };
  if (roleRank[user.role] < roleRank[minimumRole]) return { user: null, reason: "forbidden" as const };
  return { user, reason: null };
}

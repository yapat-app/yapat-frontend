import type { User } from "../types";

/** Map API/DB role strings to the lowercase values the UI expects. */
export function normalizeUserRole(
  role: string | undefined | null,
): User["role"] | undefined {
  if (!role) return undefined;
  const r = role.toLowerCase();
  if (r === "admin") return "admin";
  if (r === "team_owner") return "team_owner";
  if (r === "user") return "user";
  return undefined;
}

export function normalizeUser<T extends { role?: string }>(user: T): T & User {
  return {
    ...user,
    role: normalizeUserRole(user.role) ?? ("user" as User["role"]),
  } as T & User;
}

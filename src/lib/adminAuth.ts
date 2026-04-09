import type { User } from "firebase/auth";

/** Must match admin emails in firestore.rules `isAdmin()`. */
const ADMIN_EMAILS = new Set(["gnavsih1@gmail.com", "admin@canteen375.com"]);

export function userIsAdminFromToken(user: User, claims: { admin?: boolean }): boolean {
  const email = user.email?.toLowerCase() ?? "";
  return claims.admin === true || (email !== "" && ADMIN_EMAILS.has(email));
}

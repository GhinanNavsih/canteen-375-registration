/**
 * Firestore document ID for Members: {sanitizedFullName}_{phoneDigitsOrEmailSlug}.
 * Firebase Auth still uses its own UID; we store that in Member.uid and MemberLinks.
 */
export function sanitizeForDocIdPart(raw: string, maxLen: number): string {
  const s = raw
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return (s || "member").slice(0, maxLen);
}

export function buildMemberDocumentId(fullName: string, phoneNumber: string, email: string): string {
  const namePart = sanitizeForDocIdPart(fullName, 80);
  const digits = phoneNumber.replace(/\D/g, "");
  const phoneKey =
    digits.length >= 10
      ? digits
      : sanitizeForDocIdPart(email.split("@")[0] || email, 60);
  const id = `${namePart}_${phoneKey}`;
  if (id.length > 700) {
    return `${namePart.slice(0, 40)}_${phoneKey}`.slice(0, 700);
  }
  return id;
}

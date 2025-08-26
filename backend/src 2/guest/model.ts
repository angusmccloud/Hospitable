// src/guest/model.ts
export type Guest = {
  // single-table keys
  pk: string;                 // GUEST#<guestId>
  sk: string;                 // PROFILE
  entity: "guest";

  // model
  guestId: string;
  firstName: string | null;
  lastName: string | null;
  emails: string[];           // lowercased, valid only
  phoneNumbers: string[];     // 10-digit strings, US
  location: string | null;
  reservationIds: string[];   // de-duped
  hostNotes: string;          // editable later

  createdAt: string;
  updatedAt: string;
};

export const guestPk = (guestId: string) => `GUEST#${guestId}`;
export const guestSk = "PROFILE";

const BAD_EMAIL_TOKENS = new Set<string>([
  "(no email alias available)",
  "no email alias available",
  "no-email",
  "no email",
  "n/a",
  "na",
  "none",
  "null",
  "unknown",
  "redacted",
  "hidden",
  "not provided",
  "do-not-reply",
  "donotreply",
  "no-reply",
  "noreply",
]);

export function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();

  // Reject obvious placeholders/junk
  if (!e || BAD_EMAIL_TOKENS.has(e)) return null;

  // Very light validation — single @, basic TLD, no spaces
  if (e.indexOf(" ") >= 0) return null;
  const parts = e.split("@");
  if (parts.length !== 2) return null;
  const [, domain] = parts;
  if (!domain || domain.indexOf(".") < 0) return null;
  const tld = domain.split(".").pop()!;
  if (!/^[a-z]{2,63}$/i.test(tld)) return null;

  return e;
}

export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null; // drop non-10-digit phones
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

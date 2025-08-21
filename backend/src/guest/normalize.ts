// src/guest/normalize.ts
export function normEmail(raw?: string | null): string | null {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();
  // very light normalization; we can add provider-specific rules later
  return e || null;
}

export function normPhone(raw?: string | null): string | null {
  if (!raw) return null;
  // Keep only digits; drop leading "1" if it looks like US NANP with 11 digits
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export type ContactAggregate = {
  emails: string[];
  phones: string[];
  name?: string;
};

export function aggregateContact(input: any): ContactAggregate {
  const emails = new Set<string>();
  const phones = new Set<string>();

  // try common shapes
  const g = input?.guest ?? input;

  // name
  const name =
    [g?.first_name, g?.last_name].filter(Boolean).join(" ").trim() ||
    g?.name ||
    undefined;

  // email(s)
  const maybeEmails: Array<string | null | undefined> = [];
  if (g?.email) maybeEmails.push(g.email);
  if (Array.isArray(g?.emails)) maybeEmails.push(...g.emails);

  for (const e of maybeEmails) {
    const ne = normEmail(e as any);
    if (ne) emails.add(ne);
  }

  // phone(s)
  const rawPhones: Array<string | null | undefined> = [];
  if (Array.isArray(g?.phone_numbers)) rawPhones.push(...g.phone_numbers);
  if (g?.phone) rawPhones.push(g.phone);

  for (const p of rawPhones) {
    const np = normPhone(p as any);
    if (np) phones.add(np);
  }

  return { emails: [...emails], phones: [...phones], name };
}

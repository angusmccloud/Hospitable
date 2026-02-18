// Utility mapper for DynamoDB guest item -> API response shape
// Centralizes field name fallbacks so both getAll and getById stay consistent.
export interface GuestResponse {
  guestId: string | null;
  firstName: string | null;
  lastName: string | null;
  emails: string[];
  phoneNumbers: string[];
  reservationIds: string[];
  hostNotes: string | null;
  location: any; // Keeping as 'any' until a stronger type is defined
  createdAt: string | null;
  updatedAt: string | null;
}

export function mapGuestItem(raw: any): GuestResponse {
  if (!raw) {
    return {
      guestId: null,
      firstName: null,
      lastName: null,
      emails: [],
      phoneNumbers: [],
      reservationIds: [],
      hostNotes: null,
      location: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    guestId: raw.guestId ?? raw.id ?? null,
    firstName: raw.firstName ?? raw.first_name ?? null,
    lastName: raw.lastName ?? raw.last_name ?? null,
    emails: raw.emails ?? [],
    phoneNumbers: raw.phoneNumbers ?? raw.phone_numbers ?? [],
    reservationIds: raw.reservationIds ?? [],
    hostNotes: raw.hostNotes ?? null,
    location: raw.location ?? null,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

// Lightweight API client wired to Amplify Auth (Cognito) ID token
// Exports: api, guestsApi, reservationsApi, and types Guest, Reservation

import { fetchAuthSession } from 'aws-amplify/auth';
import { configureAmplify } from './amplify';

// ---------------- Types ----------------
export type Guest = {
  guestId: string;
  firstName?: string | null;
  lastName?: string | null;
  emails?: string[];
  phoneNumbers?: string[];
  hostNotes?: string | null;
  reservationIds?: string[];
  location?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

// New simplified Reservation shape returned by backend (with legacy fallbacks)
export type Reservation = {
  reservationId: string; // primary identifier from backend
  id?: string; // temporary alias until all components use reservationId
  propertyId?: string | null;
  guestId?: string | null;
  arrivalDate?: string | null;
  departureDate?: string | null;
  status?: string | null;
  platform?: string | null;
  nights?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

// --------------- Internal helpers ---------------
function friendlyAuthError(): never {
  throw new Error("You're not signed in. Please sign in and try again.");
}

type TokenKind = 'id' | 'access';

async function getAuthToken(kind: TokenKind = 'id'): Promise<string> {
  // Ensure Amplify is configured before fetching the session
  configureAmplify();
  const session = await fetchAuthSession();
  const source = kind === 'access' ? session.tokens?.accessToken : session.tokens?.idToken;
  const jwt = source?.toString();
  if (!jwt) friendlyAuthError();
  return jwt!;
}

function joinUrl(base: string, path: string): string {
  const b = base || '';
  const p = path || '';
  const url = new URL(b);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${p.replace(/^\/+/, '')}`;
  return url.toString();
}

// Resolve base URLs with requested precedence
const GUESTS_BASE =
  process.env.NEXT_PUBLIC_GUESTS_API_BASE || process.env.NEXT_PUBLIC_API_BASE || '';
const RESERVATIONS_BASE =
  process.env.NEXT_PUBLIC_RESERVATIONS_API_BASE || process.env.NEXT_PUBLIC_API_BASE || '';

// --------------- Public JSON helpers ---------------
export async function getJSON<T>(url: string, init: RequestInit = {}): Promise<T> {
  const tokenKind = (process.env.NEXT_PUBLIC_API_TOKEN_KIND as TokenKind | undefined) || 'id';
  const token = await getAuthToken(tokenKind);
  const res = await fetch(url, {
    ...init,
    method: init.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function putJSON<T>(
  url: string,
  body: unknown,
  init: RequestInit = {}
): Promise<T | undefined> {
  const tokenKind = (process.env.NEXT_PUBLIC_API_TOKEN_KIND as TokenKind | undefined) || 'id';
  const token = await getAuthToken(tokenKind);
  const res = await fetch(url, {
    ...init,
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
    body: JSON.stringify(body ?? {}),
  });

  if (res.status === 204) return undefined; // No Content
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  // Some APIs return a JSON body on PUT; parse if available
  const hasBody = (res.headers.get('content-length') ?? '0') !== '0';
  return hasBody ? ((await res.json()) as T) : undefined;
}

// --------------- API objects ---------------
export const api = {
  getJSON,
  putJSON,
};

export const guestsApi = {
  async list(): Promise<Guest[]> {
    const url = joinUrl(GUESTS_BASE, '/v1/guests');
    const data = await getJSON<{ guests: Guest[] }>(url);
    return data.guests ?? [];
  },
  async get(guestId: string): Promise<Guest> {
    const url = joinUrl(GUESTS_BASE, `/v1/guests/${encodeURIComponent(guestId)}`);
    return getJSON<Guest>(url);
  },
  async updateHostNotes(guestId: string, hostNotes: string): Promise<void> {
    const url = joinUrl(GUESTS_BASE, `/v1/guests/${encodeURIComponent(guestId)}/hostNotes`);
    await putJSON<void>(url, { hostNotes });
  },
};

export const reservationsApi = {
  async list(): Promise<Reservation[]> {
    const url = joinUrl(RESERVATIONS_BASE, '/v1/reservations');
    const data = await getJSON<{ reservations: any[] }>(url);
    const raw = data.reservations ?? [];
    return raw.map(r => ({
      ...r,
      reservationId: r.reservationId ?? r.id,
      id: r.id ?? r.reservationId, // keep both for now
  arrivalDate: r.arrivalDate ?? null,
  departureDate: r.departureDate ?? null,
    }));
  },
  async get(reservationId: string): Promise<Reservation> {
    const url = joinUrl(
      RESERVATIONS_BASE,
      `/v1/reservations/${encodeURIComponent(reservationId)}`
    );
    return getJSON<Reservation>(url);
  },
};

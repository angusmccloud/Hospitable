import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

// Prefer env var; fallback to SSM secure param
let cachedToken: string | null = null;

async function getBearerToken(): Promise<string> {
  if (process.env.HOSPITABLE_TOKEN && process.env.HOSPITABLE_TOKEN.trim() !== "") {
    return process.env.HOSPITABLE_TOKEN;
  }
  if (cachedToken) return cachedToken;

  const name = process.env.HOSPITABLE_TOKEN_PARAM;
  if (!name) {
    throw new Error("Missing HOSPITABLE_TOKEN or HOSPITABLE_TOKEN_PARAM");
  }
  const ssm = new SSMClient({});
  const out = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const token = out.Parameter?.Value;
  if (!token) throw new Error(`SSM parameter ${name} is empty or not found`);
  cachedToken = token;
  return token;
}

function buildUrl(path: string, search?: Record<string, string | number | boolean | string[]>) {
  const base = process.env.HOSPITABLE_API_BASE ?? "https://public.api.hospitable.com";
  const url = new URL(path, base);
  if (search) {
    for (const [k, v] of Object.entries(search)) {
      if (Array.isArray(v)) {
        v.forEach(val => url.searchParams.append(k, String(val)));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url;
}

async function apiGET<T>(path: string, search?: Record<string, any>): Promise<T> {
  const token = await getBearerToken();
  const url = buildUrl(path, search);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url.pathname}${url.search} failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Minimal property shape we store */
export type HospitableProperty = { id: string; name: string };

export async function fetchProperties(): Promise<HospitableProperty[]> {
  const all: HospitableProperty[] = [];
  for await (const page of fetchPropertiesPaged()) {
    all.push(...page);
  }
  return all;
}

export type ReservationsQuery = {
  propertyIds: string[];  // required
  startDate: string;      // YYYY-MM-DD
  endDate: string;        // YYYY-MM-DD
  include?: string[];     // default: ['guest','review','financials']
  perPage?: number;       // default: 100
};

interface PageLinks {
  first?: string | null;
  last?: string | null;
  prev?: string | null;
  next?: string | null;
}

interface PageMeta {
  current_page?: number;
  total_pages?: number; // some endpoints
  last_page?: number;   // others (as in your sample)
  // keep it open for future fields:
  [k: string]: any;
}

interface Page<T> {
  data: T[];
  meta?: PageMeta;
  links?: PageLinks;
}

export async function* fetchReservationsPaged<T = any>(q: ReservationsQuery) {
  const incoming = q.include ?? ["guest", "review", "financials"];
  const include = Array.from(new Set([...incoming, "properties"])); // add if missing
  const per_page = q.perPage ?? 100;
  let page = 1;

  while (true) {
    const params: Record<string, any> = {
      start_date: q.startDate,
      end_date: q.endDate,
      include: include.join(","),    // guest,review,financials,properties
      per_page,
      page
    };

    // support multi-property calls: properties[]=id1&properties[]=id2...
    if (q.propertyIds?.length) {
      params["properties[]"] = q.propertyIds;
    }

    const res = await apiGET<Page<T>>("/v2/reservations", params);
    const rows = res.data ?? [];
    if (rows.length === 0) break;

    yield rows;

    const metaAny = (res as any).meta || {};
    const totalPages: number = metaAny.total_pages ?? metaAny.last_page ?? page;
    if (page >= totalPages || !res.links?.next) break;
    page += 1;
  }
}

export async function* fetchPropertiesPaged(perPage = 100) {
  let page = 1;
  while (true) {
    const res = await apiGET<{ data: any[]; meta?: { current_page?: number; total_pages?: number } }>(
      "/v2/properties",
      { per_page: perPage, page }
    );
    const rows = res.data ?? [];
    if (!rows.length) break;
    yield rows.map(p => ({ id: String(p.id), name: String(p.name ?? "") }));
    const total = res.meta?.total_pages ?? page;
    if (page >= total) break;
    page += 1;
  }
}
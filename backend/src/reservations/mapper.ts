// Utility mapper for DynamoDB reservation item -> API response shape
// Ensures both getAll and getById stay aligned.
export interface ReservationResponse {
  reservationId: string | null;
  propertyId: string | null;
  propertyName: string | null;
  guestId: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  status: string | null;
  platform: string | null;
  nights: number | null;
  conversationId: string | null;
  financials: any | null; // refine later
  guests: any | null; // refine later
  review: any | null; // refine later
  createdAt: string | null;
  updatedAt: string | null;
}

// Internal cache for property names (pk = "PROP"). Populated once per cold start.
let propertyNameCache: Record<string, string> | null = null;
let propertyCachePromise: Promise<Record<string, string>> | null = null;

async function loadPropertyNameCache(doc: any, tableName: string): Promise<Record<string, string>> {
  if (propertyNameCache) return propertyNameCache;
  if (propertyCachePromise) return propertyCachePromise;
  const { QueryCommand } = await import("@aws-sdk/lib-dynamodb");
  propertyCachePromise = (async () => {
    try {
      const out = await doc.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": "PROP" },
        ProjectionExpression: "sk, #n",
        ExpressionAttributeNames: { "#n": "name" },
      }));
      const map: Record<string, string> = {};
      (out.Items ?? []).forEach((it: any) => {
        const id = String(it.sk ?? it.id ?? "").trim();
        if (id) map[id] = String(it.name ?? "");
      });
      propertyNameCache = map;
      return map;
    } catch (err) {
      // Fail soft: just return empty map
      propertyNameCache = {};
      return {};
    } finally {
      propertyCachePromise = null; // allow refresh attempts in future if needed
    }
  })();
  return propertyCachePromise;
}

function baseMapReservationItem(raw: any, propertyNames?: Record<string, string>): ReservationResponse {
  if (!raw) {
    return {
      reservationId: null,
      propertyId: null,
      propertyName: null,
      guestId: null,
      arrivalDate: null,
      departureDate: null,
      status: null,
      platform: null,
      nights: null,
      conversationId: null,
      financials: null,
      guests: null,
      review: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  const propertyId = raw.propertyId ?? raw.property_id ?? raw.properties?.[0]?.id ?? null;
  const propertyName = propertyNames?.[String(propertyId)] ?? raw.properties?.[0]?.name ?? raw.properties?.[0]?.public_name ?? null;

  return {
    reservationId: raw.id ?? raw.reservationId ?? null,
    propertyId,
    propertyName,
    guestId: raw.guestId ?? raw.guest?.id ?? null,
    arrivalDate: raw.arrival_date ?? null,
    departureDate: raw.departure_date ?? null,
    status: raw.reservation_status?.current?.category ?? null,
    platform: raw.platform ?? null,
    nights: raw.nights ?? null,
    conversationId: raw.conversation_id ?? null,
    financials: raw.financials ?? null,
    guests: raw.guests ?? null,
    review: raw.review ?? null,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

// Public: returns a mapper function with property name cache loaded.
export async function getReservationMapper(doc: any, tableName: string): Promise<(raw: any) => ReservationResponse> {
  const propertyNames = await loadPropertyNameCache(doc, tableName);
  return (raw: any) => baseMapReservationItem(raw, propertyNames);
}

// Lightweight direct mapping if property names are already cached/ not needed.
export function mapReservationItem(raw: any): ReservationResponse {
  return baseMapReservationItem(raw, propertyNameCache || undefined);
}

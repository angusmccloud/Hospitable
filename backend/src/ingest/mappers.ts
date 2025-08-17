type AnyObject = Record<string, any>;

const omit = (obj: AnyObject, keys: string[]) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

function pickPropertyId(r: AnyObject): string {
  // Prefer include=properties; fall back to common shapes
  return String(
    r.propertyId ??
      r.property_id ??
      r.property?.id ??
      r.properties?.[0]?.id ??
      r.id ?? // for property rows themselves
      "UNKNOWN"
  );
}

function pickArrivalDate(r: AnyObject): string {
  const raw =
    r.arrival_date ??
    r.arrivalDate ??
    r.check_in_date ??
    r.check_in ??
    r.departure_date ??
    r.booking_date ??
    "0000-00-00";
  return String(raw).slice(0, 10); // YYYY-MM-DD
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Property -> Dynamo item
 * Stored as: pk = "PROP", sk = "<propertyId>"
 */
export function toPropertyItems(rows: AnyObject[]) {
  const now = new Date().toISOString();
  return rows.map((p) => {
    const id = String(p.id ?? p.propertyId ?? p.property_id ?? cryptoRandom());
    return {
      pk: "PROP",
      sk: id,
      entity: "property",
      id,
      name: p.name ?? p.public_name ?? "",
      updatedAt: now,
      ...p, // keep other fields if you want; remove if you prefer trimmed
    };
  });
}

/**
 * Reservation -> Dynamo item
 * pk = `RES#<propertyId>`, sk = `<arrivalDate>#<reservationId>`
 * Removes deprecated Hospitable fields: status, status_history
 */
export function toReservationItems(rows: AnyObject[]) {
  const now = new Date().toISOString();

  return rows.map((r) => {
    const propertyId = pickPropertyId(r);
    const id = String(r.id ?? r.reservation_id ?? cryptoRandom());
    const clean = omit(r, ["status", "status_history"]); // deprecated fields

    return {
      pk: `RES#${propertyId}`, // partitioned by property
      sk: id,                  // stable sort key = reservation id
      entity: "reservation",
      propertyId,
      id,
      ...clean,
      updatedAt: now,
    };
  });
}
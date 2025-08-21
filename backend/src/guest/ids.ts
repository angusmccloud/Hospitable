// src/guest/ids.ts
import crypto from "crypto";

export const uuid = () => crypto.randomUUID();

// Keys for single-table items
export const GUEST_PK = (guestId: string) => `GUEST#${guestId}`;
export const GUEST_PROFILE_SK = "PROFILE";
export const GUEST_EDGE_SK = (arrivalIsoDate: string, reservationId: string) =>
  `ARR#${arrivalIsoDate}#RES#${reservationId}`;

// Identity records
export const EMAIL_PK = (email: string) => `EMAIL#${email}`;
export const EMAIL_SK = (guestId: string) => `GUEST#${guestId}`;

export const PHONE_PK = (phone: string) => `PHONE#${phone}`;
export const PHONE_SK = (guestId: string) => `GUEST#${guestId}`;

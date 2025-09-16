"use client";

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { guestsApi, reservationsApi, type Guest, type Reservation } from '../lib/api';
import { useMemo } from 'react';

// Fetch guests list
function useGuests() {
  return useQuery<Guest[], Error>({
    queryKey: ['guests', 'list'],
    queryFn: () => guestsApi.list(),
    staleTime: 5 * 60 * 1000,
  });
}

// Fetch reservations list
function useReservations() {
  return useQuery<Reservation[], Error>({
    queryKey: ['reservations', 'list'],
    queryFn: () => reservationsApi.list(),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePortalData() {
  const guestsQ = useGuests();
  const reservationsQ = useReservations();
  const qc = useQueryClient();

  // Index reservations by guest
  const reservationsByGuest = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    (reservationsQ.data || []).forEach(r => {
      if (!r.guestId) return;
      if (!map[r.guestId]) map[r.guestId] = [];
      map[r.guestId].push(r);
    });
    return map;
  }, [reservationsQ.data]);

  // Decorated guests with derived stats
  const enrichedGuests = useMemo(() => {
    const toDateOnly = (v?: string | null): string | null => {
      if (!v) return null;
      const d = new Date(v);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10); // YYYY-MM-DD
    };
    return (guestsQ.data || []).map(g => {
      const rs = reservationsByGuest[g.guestId] || [];
      // Compute earliest arrival & latest departure by numeric date comparison
      let earliest: number | null = null;
      let latest: number | null = null;
      rs.forEach(r => {
        if (r.arrivalDate) {
          const t = new Date(r.arrivalDate).getTime();
          if (!isNaN(t)) earliest = earliest == null || t < earliest ? t : earliest;
        }
        if (r.departureDate) {
          const t2 = new Date(r.departureDate).getTime();
          if (!isNaN(t2)) latest = latest == null || t2 > latest ? t2 : latest;
        }
      });
      const firstArrival = earliest != null ? toDateOnly(new Date(earliest).toISOString()) : null;
      const lastDeparture = latest != null ? toDateOnly(new Date(latest).toISOString()) : null;
      return {
        ...g,
        reservationCount: rs.length,
        firstArrival,
        lastDeparture,
      } as Guest & { reservationCount: number; firstArrival: string | null; lastDeparture: string | null };
    });
  }, [guestsQ.data, reservationsByGuest]);

  // Guest lookup for reservations enrichment
  const guestsIndex = useMemo(() => {
    const map: Record<string, Guest> = {};
    (guestsQ.data || []).forEach(g => { map[g.guestId] = g; });
    return map;
  }, [guestsQ.data]);

  const enrichedReservations = useMemo(() => {
    return (reservationsQ.data || []).map(r => {
      const g = r.guestId ? guestsIndex[r.guestId] : undefined;
      return {
        ...r,
        guestFirstName: g?.firstName || null,
        guestLastName: g?.lastName || null,
        guestPrimaryEmail: g?.emails?.[0] || null,
      } as Reservation & { guestFirstName: string | null; guestLastName: string | null; guestPrimaryEmail: string | null };
    });
  }, [reservationsQ.data, guestsIndex]);

  return {
    guests: enrichedGuests,
    reservations: enrichedReservations,
    guestsQuery: guestsQ,
    reservationsQuery: reservationsQ,
    isLoading: guestsQ.isLoading || reservationsQ.isLoading,
    isError: guestsQ.isError || reservationsQ.isError,
    error: guestsQ.error || reservationsQ.error,
    queryClient: qc,
  };
}

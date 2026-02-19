"use client";

import React, { useMemo, useState } from 'react';
import { Typography, CircularProgress, Alert, TextField, Stack, Box } from '@mui/material';
import { Virtuoso } from 'react-virtuoso';
import GuestCard, { type GuestCardData } from '../../components/GuestCard';
import { usePortalData } from '../../hooks/usePortalData';

export default function GuestsPage() {
  const { guests, reservationsByGuest, isLoading, isError, error } = usePortalData();

  const rows: GuestCardData[] = useMemo(() => {
    const mapped = (guests || []).map(g => ({
      guestId: g.guestId,
      firstName: g.firstName,
      lastName: g.lastName,
      emails: g.emails,
      phoneNumbers: g.phoneNumbers,
      hostNotes: g.hostNotes,
      location: g.location,
      reservations: (reservationsByGuest[g.guestId] || []).map(r => ({
        reservationId: r.reservationId,
        arrivalDate: r.arrivalDate,
        departureDate: r.departureDate,
        nights: r.nights,
        status: r.status,
        propertyName: r.propertyName,
        conversationId: r.conversationId,
      })).sort((a, b) => (b.arrivalDate || '').localeCompare(a.arrivalDate || '')),
    }));
    mapped.sort((a, b) => {
      const nameA = `${(a.firstName || '').toLowerCase()} ${(a.lastName || '').toLowerCase()}`;
      const nameB = `${(b.firstName || '').toLowerCase()} ${(b.lastName || '').toLowerCase()}`;
      return nameA.localeCompare(nameB);
    });
    return mapped;
  }, [guests, reservationsByGuest]);

  const [search, setSearch] = useState('');
  const filteredRows = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter(r => {
      const blob = JSON.stringify(r).toLowerCase();
      return terms.every(t => blob.includes(t));
    });
  }, [rows, search]);

  if (isLoading) return <Loading />;
  if (isError) return <ErrorView message={(error as Error)?.message || 'Error'} />;

  return (
    <Stack spacing={1} sx={{ flex: 1, minHeight: 0, height: '100%' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h5">Guests ({filteredRows.length})</Typography>
        <TextField
          size="small"
          label="Search"
          placeholder="Search guests"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Virtuoso
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          totalCount={filteredRows.length}
          itemContent={index => <GuestCard guest={filteredRows[index]} />}
          overscan={200}
        />
      </Box>
    </Stack>
  );
}

function Loading() {
  return (
    <div style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress />
    </div>
  );
}

function ErrorView({ message }: { message: string }) { return <Alert severity="error" sx={{ my: 4 }}>{message}</Alert>; }

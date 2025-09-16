"use client";

import React, { useMemo, useState } from 'react';
import { Typography, CircularProgress, Alert, TextField, Stack, Link } from '@mui/material';
import PortalDataGrid from '../../components/PortalDataGrid';
import { usePortalData } from '../../hooks/usePortalData';

export default function ReservationsPage() {
  const { reservations, isLoading, isError, error } = usePortalData();

  const columns = useMemo(() => [
    { field: 'arrivalDate', headerName: 'Arrival', width: 120 },
    { field: 'departureDate', headerName: 'Departure', width: 130 },
    { field: 'nights', headerName: 'Nights', type: 'number', width: 90 },
    { field: 'status', headerName: 'Status', width: 110 },
    { field: 'platform', headerName: 'Platform', width: 110 },
    { field: 'guestFirstName', headerName: 'Guest First', width: 130 },
    { field: 'guestLastName', headerName: 'Guest Last', width: 130 },
    { field: 'guestPrimaryEmail', headerName: 'Guest Email', width: 220 },
    { field: 'propertyId', headerName: 'Property', width: 140 },
    { field: 'rating', headerName: 'Rating', width: 90 },
    { field: 'hospitableLink', headerName: 'Hospitable', width: 130, renderCell: (p: any) => p.value ? <Link href={p.value} target="_blank" rel="noreferrer">Open</Link> : null },
  ], []);

  const rows = useMemo(() => (reservations || []).map(r => {
    const dateOnly = (d?: string | null) => d ? new Date(d).toISOString().slice(0,10) : '';
    const rating = (r as any).rating?.public?.rating ?? null;
    const convId = (r as any).conversationId || (r as any).conversation_id || null;
    return {
      id: r.reservationId || r.id,
      ...r,
      arrivalDate: dateOnly(r.arrivalDate),
      departureDate: dateOnly(r.departureDate),
      rating,
      hospitableLink: convId ? `https://my.hospitable.com/inbox/thread/${convId}` : null,
    };
  }), [reservations]);

  // Default status filter = accepted + full-text search
  const [search, setSearch] = useState('');
  const filteredRows = useMemo(() => {
    const base = rows.filter(r => (r.status || '').toLowerCase() === 'accepted');
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return base;
    return base.filter(r => {
      const blob = JSON.stringify(r).toLowerCase();
      return terms.every(t => blob.includes(t));
    });
  }, [rows, search]);

  if (isLoading) return <Loading />;
  if (isError) return <ErrorView message={(error as Error)?.message || 'Error'} />;

  return (
    <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h5">Reservations ({filteredRows.length})</Typography>
        <TextField
          size="small"
            label="Search"
            placeholder="Search reservations"
            value={search}
            onChange={e => setSearch(e.target.value)}
        />
      </Stack>
      <PortalDataGrid rows={filteredRows} columns={columns as any} />
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

"use client";

import React, { useMemo, useState } from 'react';
import {
  Typography,
  CircularProgress,
  Alert,
  TextField,
  Stack,
  Box,
  ToggleButtonGroup,
  ToggleButton,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { Virtuoso } from 'react-virtuoso';
import ReservationCard, { type ReservationCardData } from '../../components/ReservationCard';
import { usePortalData } from '../../hooks/usePortalData';

type SortMode = 'date-desc' | 'date-asc' | 'nights-desc' | 'nights-asc';

export default function ReservationsPage() {
  const { reservations, isLoading, isError, error } = usePortalData();

  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date-desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [returningOnly, setReturningOnly] = useState(false);

  const rows: ReservationCardData[] = useMemo(() => (reservations || []).map(r => {
    const rating = (r as any).rating?.public?.rating ?? (r as any).review?.public?.rating ?? null;
    const revenue = r.financials?.host?.revenue?.formatted ?? null;
    return {
      reservationId: r.reservationId || r.id || '',
      arrivalDate: r.arrivalDate,
      departureDate: r.departureDate,
      nights: r.nights,
      status: r.status,
      platform: r.platform,
      propertyName: r.propertyName,
      guestFirstName: (r as any).guestFirstName,
      guestLastName: (r as any).guestLastName,
      guestPrimaryEmail: (r as any).guestPrimaryEmail,
      rating,
      revenue,
      hospitableLink: r.conversationId ? `https://my.hospitable.com/inbox/thread/${r.conversationId}` : null,
      guests: r.guests ?? null,
      stayNumber: (r as any).stayNumber ?? null,
      guestTotalStays: (r as any).guestTotalStays ?? null,
      hostNotes: (r as any).hostNotes ?? null,
    };
  }), [reservations]);

  const filteredRows = useMemo(() => {
    let base = rows.filter(r => {
      const s = (r.status || '').toLowerCase();
      return s === 'accepted' || s === 'cancelled';
    });

    // Date range filter on check-in date
    if (dateFrom) {
      base = base.filter(r => r.arrivalDate && r.arrivalDate.slice(0, 10) >= dateFrom);
    }
    if (dateTo) {
      base = base.filter(r => r.arrivalDate && r.arrivalDate.slice(0, 10) <= dateTo);
    }

    // Returning guests filter
    if (returningOnly) {
      base = base.filter(r => (r.guestTotalStays ?? 0) > 1);
    }

    // Sort
    base.sort((a, b) => {
      switch (sortMode) {
        case 'date-asc':
          return (a.arrivalDate || '').localeCompare(b.arrivalDate || '');
        case 'date-desc':
          return (b.arrivalDate || '').localeCompare(a.arrivalDate || '');
        case 'nights-desc':
          return (b.nights || 0) - (a.nights || 0);
        case 'nights-asc':
          return (a.nights || 0) - (b.nights || 0);
        default:
          return 0;
      }
    });

    // Text search
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) {
      base = base.filter(r => {
        const blob = JSON.stringify(r).toLowerCase();
        return terms.every(t => blob.includes(t));
      });
    }

    return base;
  }, [rows, search, sortMode, dateFrom, dateTo, returningOnly]);

  if (isLoading) return <Loading />;
  if (isError) return <ErrorView message={(error as Error)?.message || 'Error'} />;

  return (
    <Stack spacing={1} sx={{ flex: 1, minHeight: 0, height: '100%' }}>
      {/* Header row */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="h5">Reservations ({filteredRows.length})</Typography>
        <TextField
          size="small"
          label="Search"
          placeholder="Search reservations"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </Stack>

      {/* Filters row */}
      <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center" sx={{ mb: 0.5 }}>
        {/* Sort */}
        <ToggleButtonGroup
          size="small"
          exclusive
          value={sortMode}
          onChange={(_, v) => v && setSortMode(v as SortMode)}
        >
          <ToggleButton value="date-desc">Date ↓</ToggleButton>
          <ToggleButton value="date-asc">Date ↑</ToggleButton>
          <ToggleButton value="nights-desc">Nights ↓</ToggleButton>
          <ToggleButton value="nights-asc">Nights ↑</ToggleButton>
        </ToggleButtonGroup>

        {/* Date range filter */}
        <TextField
          size="small"
          type="date"
          label="Check-in from"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 160 }}
        />
        <TextField
          size="small"
          type="date"
          label="Check-in to"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 160 }}
        />

        {/* Returning guests toggle */}
        <FormControlLabel
          control={<Switch checked={returningOnly} onChange={(_, v) => setReturningOnly(v)} size="small" />}
          label="Returning guests"
        />
      </Stack>

      {/* Virtualized list */}
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Virtuoso
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          totalCount={filteredRows.length}
          itemContent={index => <ReservationCard reservation={filteredRows[index]} />}
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

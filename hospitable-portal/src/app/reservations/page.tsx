"use client";

import React, { useMemo, useState } from 'react';
import {
  Typography,
  CircularProgress,
  Alert,
  TextField,
  Stack,
  Box,
  FormControlLabel,
  Switch,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { VirtuosoGrid } from 'react-virtuoso';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format as fmtDateFns } from 'date-fns';
import ReservationCard, { type ReservationCardData } from '../../components/ReservationCard';
import { usePortalData } from '../../hooks/usePortalData';

/* ── Responsive grid wrappers for VirtuosoGrid ─────────────────────── */

const ListContainer = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, children, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      style={{ display: 'flex', flexWrap: 'wrap', ...style }}
    >
      {children}
    </div>
  ),
);
ListContainer.displayName = 'ListContainer';

/** 2 cols ≥ 600 px · 1 col below */
const ItemContainer: React.FC<React.HTMLAttributes<HTMLDivElement> & { 'data-index'?: number }> = (props) => (
  <Box
    {...props}
    sx={{
      width: '100%',
      boxSizing: 'border-box',
      px: 0.75,
      pb: 0,
      '@media (min-width: 600px)': { width: '50%' },
    }}
  />
);

const gridComponents = { List: ListContainer, Item: ItemContainer };

/* ── Sort options ───────────────────────────────────────────────────── */

type SortMode = 'date-desc' | 'date-asc' | 'nights-desc' | 'nights-asc';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'date-desc', label: 'Date (newest)' },
  { value: 'date-asc', label: 'Date (oldest)' },
  { value: 'nights-desc', label: 'Nights (most)' },
  { value: 'nights-asc', label: 'Nights (fewest)' },
];

/* ── Helpers ────────────────────────────────────────────────────────── */

/** Convert a Date to 'yyyy-MM-dd' for comparison, or '' */
function toISODate(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return '';
  return fmtDateFns(d, 'yyyy-MM-dd');
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default function ReservationsPage() {
  const { reservations, isLoading, isError, error } = usePortalData();

  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('date-desc');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
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
    const fromStr = toISODate(dateFrom);
    const toStr = toISODate(dateTo);
    if (fromStr) {
      base = base.filter(r => r.arrivalDate && r.arrivalDate.slice(0, 10) >= fromStr);
    }
    if (toStr) {
      base = base.filter(r => r.arrivalDate && r.arrivalDate.slice(0, 10) <= toStr);
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
    <LocalizationProvider dateAdapter={AdapterDateFns}>
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
          {/* Sort dropdown */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Sort by</InputLabel>
            <Select
              value={sortMode}
              label="Sort by"
              onChange={e => setSortMode(e.target.value as SortMode)}
            >
              {SORT_OPTIONS.map(o => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Date range filter */}
          <DatePicker
            label="Check-in from"
            value={dateFrom}
            onChange={setDateFrom}
            slotProps={{ textField: { size: 'small', sx: { width: 170 } } }}
          />
          <DatePicker
            label="Check-in to"
            value={dateTo}
            onChange={setDateTo}
            slotProps={{ textField: { size: 'small', sx: { width: 170 } } }}
          />

          {/* Returning guests toggle */}
          <FormControlLabel
            control={<Switch checked={returningOnly} onChange={(_, v) => setReturningOnly(v)} size="small" />}
            label="Returning guests"
          />
        </Stack>

        {/* Virtualized masonry grid */}
        <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <VirtuosoGrid
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            totalCount={filteredRows.length}
            components={gridComponents}
            itemContent={index => <ReservationCard reservation={filteredRows[index]} />}
            overscan={200}
          />
        </Box>
      </Stack>
    </LocalizationProvider>
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

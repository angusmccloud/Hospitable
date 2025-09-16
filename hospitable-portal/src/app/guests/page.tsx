"use client";

import React, { useMemo, useEffect, useState } from 'react';
import { Typography, CircularProgress, Alert, TextField, Stack } from '@mui/material';
import PortalDataGrid from '../../components/PortalDataGrid';
import { usePortalData } from '../../hooks/usePortalData';

export default function GuestsPage() {
  const { guests, isLoading, isError, error } = usePortalData();
  // Ensure first paint (SSR + client) is consistent to avoid hydration mismatch with DataGrid internals
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const columns = useMemo(() => [
    { field: 'guestId', headerName: 'Guest ID', width: 160 },
    { field: 'firstName', headerName: 'First', width: 140 },
    { field: 'lastName', headerName: 'Last', width: 140 },
    { field: 'emailDisplay', headerName: 'Email', width: 260 },
    { field: 'phoneDisplay', headerName: 'Phone', width: 180 },
    { field: 'reservationCount', headerName: 'Res Count', type: 'number', width: 120 },
    { field: 'firstArrival', headerName: 'First Arrival', width: 140 },
    { field: 'lastDeparture', headerName: 'Last Departure', width: 150 },
    { field: 'location', headerName: 'Location', width: 160 },
    // hostNotes kept in row object for drill-in; omit column for cleanliness
  ], []);

  const rows = useMemo(() => {
    function properCase(s?: string | null): string | null {
      if (!s) return s ?? null;
      return s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
    }
    function fmtPhone(raw?: string | null): string | null {
      if (!raw) return raw ?? null;
      let p = raw.replace(/[^0-9]/g, '');
      if (p.length === 11 && p.startsWith('1')) p = p.slice(1);
      if (p.length === 10) return `(${p.slice(0,3)}) ${p.slice(3,6)}-${p.slice(6)}`;
      return raw; // leave as-is if not 10 (after optional leading 1)
    }
    return (guests || []).map(g => {
      const emailCount = g.emails?.length || 0;
      const phoneCount = g.phoneNumbers?.length || 0;
      const firstEmail = g.emails?.[0] || '';
      const firstPhoneRaw = g.phoneNumbers?.[0] || '';
      const phoneFormatted = fmtPhone(firstPhoneRaw);
      const emailDisplay = emailCount > 1 ? `${firstEmail} (1 of ${emailCount})` : firstEmail;
      const phoneDisplay = phoneCount > 1 ? `${phoneFormatted || ''} (1 of ${phoneCount})` : (phoneFormatted || '');
      return {
        id: g.guestId,
        ...g,
        firstName: properCase(g.firstName) || '',
        lastName: properCase(g.lastName) || '',
        reservationCount: g.reservationIds?.length || 0,
        emailDisplay,
        phoneDisplay,
      };
    });
  }, [guests]);

  // Quick full-text search across JSON string
  const [search, setSearch] = useState('');
  const filteredRows = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter(r => {
      const blob = JSON.stringify(r).toLowerCase();
      return terms.every(t => blob.includes(t));
    });
  }, [rows, search]);

  if (isLoading || !mounted) return <Loading />; // keep consistent SSR/CSR shell
  if (isError) return <ErrorView message={(error as Error)?.message || 'Error'} />;

  return (
    <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
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

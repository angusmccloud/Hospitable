"use client";

import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Stack,
  Link as MuiLink,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import CancelIcon from '@mui/icons-material/Cancel';
import PetsIcon from '@mui/icons-material/Pets';
import NotesIcon from '@mui/icons-material/Notes';

function properCase(s?: string | null): string {
  if (!s) return '';
  return s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function resStatusIcon(status?: string | null, departureDate?: string | null) {
  const s = (status || '').toLowerCase();
  if (s === 'cancelled') return <CancelIcon sx={{ fontSize: 20, color: 'error.main' }} />;
  const isPast = departureDate ? new Date(departureDate) < new Date() : false;
  if (s === 'accepted' && isPast) return <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />;
  if (s === 'accepted') return <EventAvailableIcon sx={{ fontSize: 20, color: 'info.main' }} />;
  return null;
}

export interface ReservationCardData {
  reservationId: string;
  arrivalDate?: string | null;
  departureDate?: string | null;
  nights?: number | null;
  status?: string | null;
  platform?: string | null;
  propertyName?: string | null;
  guestFirstName?: string | null;
  guestLastName?: string | null;
  guestPrimaryEmail?: string | null;
  rating?: number | null;
  revenue?: string | null;
  hospitableLink?: string | null;
  guests?: { total?: number | null; adult_count?: number | null; child_count?: number | null; infant_count?: number | null; pet_count?: number | null } | null;
  stayNumber?: number | null;
  guestTotalStays?: number | null;
  hostNotes?: string | null;
}

function partyLabel(guests?: ReservationCardData['guests']): string | null {
  if (!guests) return null;
  const parts: string[] = [];
  if (guests.adult_count) parts.push(`${guests.adult_count} adult${guests.adult_count !== 1 ? 's' : ''}`);
  if (guests.child_count) parts.push(`${guests.child_count} kid${guests.child_count !== 1 ? 's' : ''}`);
  if (guests.infant_count) parts.push(`${guests.infant_count} infant${guests.infant_count !== 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : null;
}

export const ReservationCard: React.FC<{ reservation: ReservationCardData }> = ({ reservation }) => {
  const r = reservation;
  const guestName = [properCase(r.guestFirstName), properCase(r.guestLastName)].filter(Boolean).join(' ');

  const dateRange = [fmtDate(r.arrivalDate), fmtDate(r.departureDate)].filter(Boolean).join(' \u2192 ');
  const nightsLabel = r.nights != null ? `${r.nights} night${r.nights !== 1 ? 's' : ''}` : null;
  const party = partyLabel(r.guests);
  const hasPets = !!(r.guests?.pet_count && r.guests.pet_count > 0);
  const stayLabel = r.stayNumber != null ? `${ordinal(r.stayNumber)} stay` : null;

  return (
    <Card variant="outlined" sx={{ mb: 1.5 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        {/* Row 1: Status icon + Dates + nights */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            {resStatusIcon(r.status, r.departureDate)}
            <Typography variant="subtitle1" fontWeight={600}>{dateRange || 'No dates'}</Typography>
            {nightsLabel && (
              <Typography variant="body2" color="text.secondary">({nightsLabel})</Typography>
            )}
          </Stack>
          {r.revenue && (
            <Typography variant="subtitle2" fontWeight={600} color="success.main">
              {r.revenue}
            </Typography>
          )}
        </Stack>

        {/* Row 2: Guest info + stay number */}
        <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center" sx={{ mb: 0.75 }}>
          {guestName && (
            <Typography variant="body2">{guestName}</Typography>
          )}
          {stayLabel && (
            <Typography variant="body2" color="text.secondary" fontStyle="italic">
              {stayLabel}
            </Typography>
          )}
          {r.guestPrimaryEmail && (
            <Typography variant="body2" color="text.secondary">{r.guestPrimaryEmail}</Typography>
          )}
        </Stack>

        {/* Row 3: Metadata chips */}
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          {r.propertyName && <Chip label={r.propertyName} size="small" variant="outlined" />}
          {r.platform && <Chip label={r.platform} size="small" variant="outlined" />}
          {party && <Chip label={party} size="small" variant="outlined" />}
          {hasPets && <Chip icon={<PetsIcon sx={{ fontSize: 14 }} />} label={`${r.guests!.pet_count} pet${r.guests!.pet_count! > 1 ? 's' : ''}`} size="small" variant="outlined" />}
          {r.rating != null && (
            <Chip label={`${r.rating}\u2605`} size="small" variant="outlined" />
          )}
          {r.hospitableLink && (
            <MuiLink
              href={r.hospitableLink}
              target="_blank"
              rel="noreferrer"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3, fontSize: '0.8125rem' }}
            >
              Hospitable <OpenInNewIcon sx={{ fontSize: 14 }} />
            </MuiLink>
          )}
        </Stack>

        {/* Row 4: Guest notes (if any) */}
        {r.hostNotes && (
          <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ mt: 0.75 }}>
            <NotesIcon sx={{ fontSize: 16, color: 'text.secondary', mt: 0.25 }} />
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              {r.hostNotes}
            </Typography>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

export default ReservationCard;

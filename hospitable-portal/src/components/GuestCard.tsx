"use client";

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Stack,
  Box,
  Collapse,
  IconButton,
  TextField,
  Button,
  CircularProgress,
  Divider,
  Link as MuiLink,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import CancelIcon from '@mui/icons-material/Cancel';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import PlaceIcon from '@mui/icons-material/Place';
import { guestsApi } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';

function properCase(s?: string | null): string {
  if (!s) return '';
  return s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
}

function fmtPhone(raw?: string | null): string {
  if (!raw) return '';
  let p = raw.replace(/[^0-9]/g, '');
  if (p.length === 11 && p.startsWith('1')) p = p.slice(1);
  if (p.length === 10) return `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
  return raw;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function resStatusIcon(status?: string | null, departureDate?: string | null) {
  const s = (status || '').toLowerCase();
  if (s === 'cancelled') return <CancelIcon sx={{ fontSize: 18, color: 'error.main' }} />;
  const isPast = departureDate ? new Date(departureDate) < new Date() : false;
  if (s === 'accepted' && isPast) return <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main' }} />;
  if (s === 'accepted') return <EventAvailableIcon sx={{ fontSize: 18, color: 'info.main' }} />;
  return null;
}

export interface GuestReservation {
  reservationId: string;
  arrivalDate?: string | null;
  departureDate?: string | null;
  nights?: number | null;
  status?: string | null;
  propertyName?: string | null;
  conversationId?: string | null;
}

export interface GuestCardData {
  guestId: string;
  firstName?: string | null;
  lastName?: string | null;
  emails?: string[];
  phoneNumbers?: string[];
  hostNotes?: string | null;
  location?: string | null;
  reservations: GuestReservation[];
}

export const GuestCard: React.FC<{ guest: GuestCardData }> = ({ guest }) => {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(guest.hostNotes || '');
  const [saving, setSaving] = useState(false);
  const [resOpen, setResOpen] = useState(false);

  const name = [properCase(guest.firstName), properCase(guest.lastName)].filter(Boolean).join(' ') || 'Unknown Guest';
  const primaryEmail = guest.emails?.[0] || '';
  const extraEmails = (guest.emails?.length || 0) - 1;
  const primaryPhone = fmtPhone(guest.phoneNumbers?.[0]);
  const extraPhones = (guest.phoneNumbers?.length || 0) - 1;
  const resCount = guest.reservations.length;

  const handleSave = async () => {
    setSaving(true);
    try {
      await guestsApi.updateHostNotes(guest.guestId, draft);
      qc.invalidateQueries({ queryKey: ['guests', 'list'] });
      setEditing(false);
    } catch (e) {
      console.error('Failed to save host notes', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ mb: 1.5 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        {/* Row 1: Name + location */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
          <Typography variant="subtitle1" fontWeight={600}>{name}</Typography>
          {guest.location && (
            <Chip icon={<PlaceIcon />} label={guest.location} size="small" variant="outlined" />
          )}
        </Stack>

        {/* Row 2: Contact info */}
        <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 1 }}>
          {primaryEmail && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <EmailIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {primaryEmail}{extraEmails > 0 ? ` (+${extraEmails})` : ''}
              </Typography>
            </Stack>
          )}
          {primaryPhone && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {primaryPhone}{extraPhones > 0 ? ` (+${extraPhones})` : ''}
              </Typography>
            </Stack>
          )}
        </Stack>

        {/* Host Notes — inline text with edit toggle */}
        <Box sx={{ mb: 1 }}>
          {!editing ? (
            <Stack direction="row" alignItems="flex-start" spacing={0.5}>
              <Typography variant="body2" color={guest.hostNotes ? 'text.primary' : 'text.secondary'} sx={{ whiteSpace: 'pre-wrap', flex: 1 }}>
                {guest.hostNotes || 'No host notes'}
              </Typography>
              <IconButton size="small" onClick={() => { setEditing(true); setDraft(guest.hostNotes || ''); }}>
                <EditIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Stack>
          ) : (
            <Box>
              <TextField
                multiline
                minRows={2}
                maxRows={8}
                fullWidth
                size="small"
                value={draft}
                onChange={e => setDraft(e.target.value)}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={14} /> : undefined}
                >
                  Save
                </Button>
                <Button size="small" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </Button>
              </Stack>
            </Box>
          )}
        </Box>

        {/* Expandable reservations at bottom */}
        <Divider sx={{ mb: 0.5 }} />
        <Stack
          direction="row"
          alignItems="center"
          onClick={() => setResOpen(o => !o)}
          sx={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <Typography variant="body2" fontWeight={500}>
            {resCount} reservation{resCount !== 1 ? 's' : ''}
          </Typography>
          <IconButton size="small">
            {resOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Stack>
        <Collapse in={resOpen}>
          {guest.reservations.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>None</Typography>
          ) : (
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              {guest.reservations.map(r => {
                const hospLink = r.conversationId
                  ? `https://my.hospitable.com/inbox/thread/${r.conversationId}`
                  : null;
                return (
                  <Stack key={r.reservationId} direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    {resStatusIcon(r.status, r.departureDate)}
                    <Typography variant="body2">
                      {fmtDate(r.arrivalDate)} &rarr; {fmtDate(r.departureDate)}
                    </Typography>
                    {r.nights != null && (
                      <Typography variant="caption" color="text.secondary">
                        {r.nights}n
                      </Typography>
                    )}
                    {r.propertyName && (
                      <Typography variant="body2" color="text.secondary">
                        {r.propertyName}
                      </Typography>
                    )}
                    {hospLink && (
                      <MuiLink
                        href={hospLink}
                        target="_blank"
                        rel="noreferrer"
                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3, fontSize: '0.8125rem' }}
                      >
                        View in Hospitable <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </MuiLink>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          )}
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default GuestCard;

"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CircularProgress, Stack, Typography } from '@mui/material';
import { configureAmplify } from '../../lib/amplify';
import { fetchAuthSession } from 'aws-amplify/auth';

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        configureAmplify();
        // Trigger session fetch; this processes the authorization code on first load
        await fetchAuthSession();
      } catch {
        // ignore; AuthGate will handle not-signed-in state
      } finally {
        if (mounted) router.replace('/');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <Stack spacing={2} alignItems="center" justifyContent="center" sx={{ minHeight: '60vh' }}>
      <CircularProgress />
      <Typography variant="body1">Signing you in…</Typography>
    </Stack>
  );
}

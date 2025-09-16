"use client";

import React, { useEffect, useState } from 'react';
import { Button, CircularProgress, Stack, Typography, Container } from '@mui/material';
import { configureAmplify } from '../lib/amplify';
import { getCurrentUser, signInWithRedirect } from 'aws-amplify/auth';
import AppHeader from './AppHeader';

const centerStyle: React.CSSProperties = {
  minHeight: '60vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const SignInView: React.FC = () => {
  const onSignIn = async () => {
    // Use Hosted UI via redirect; let Amplify derive the URL from configuration
    await signInWithRedirect();
  };
  return (
    <Stack spacing={2} alignItems="center" justifyContent="center" sx={{ mt: 8 }}>
      <Typography variant="h6">Please sign in to continue</Typography>
      <Button variant="contained" onClick={onSignIn}>Sign in</Button>
    </Stack>
  );
};

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;
    configureAmplify();
    (async () => {
      try {
        await getCurrentUser();
        if (mounted) setAuthed(true);
      } catch {
        if (mounted) setAuthed(false);
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Render a stable shell to avoid SSR/CSR divergence; swap inner content client-side only
  return (
    <div data-role="auth-gate">
      {checking ? (
        <div style={centerStyle}>
          <CircularProgress />
        </div>
      ) : !authed ? (
        <SignInView />
      ) : (
        <>
          <AppHeader />
          <Container maxWidth={false} sx={{ py: 4, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {children}
          </Container>
        </>
      )}
    </div>
  );
};

export default AuthGate;

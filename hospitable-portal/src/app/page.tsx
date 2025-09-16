"use client";

import React from 'react';
import { Typography, Card, CardContent, Skeleton, Stack, Box } from '@mui/material';

export default function Home() {
  const placeholders = Array.from({ length: 6 });
  return (
    <Stack spacing={3}>
      <Typography variant="h5" gutterBottom>Metrics (Coming Soon)</Typography>
      <Box display="grid" gap={2} gridTemplateColumns={{ xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }}>
        {placeholders.map((_, i) => (
          <Card key={i} variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>Metric {i + 1}</Typography>
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="rectangular" height={32} sx={{ my: 1, borderRadius: 1 }} />
              <Skeleton variant="text" width="40%" />
            </CardContent>
          </Card>
        ))}
      </Box>
    </Stack>
  );
}

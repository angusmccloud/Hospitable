"use client";

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      gcTime: 24 * 60 * 60 * 1000, // keep data for a day
    },
    mutations: {
      retry: 1,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'portal-react-query',
});

export const AppQueryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <PersistQueryClientProvider client={client} persistOptions={{ persister }}>
      {children}
    </PersistQueryClientProvider>
  );
};

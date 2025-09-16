"use client";

import React, { useState } from 'react';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';

function createEmotionCache() {
  let insertionPoint: HTMLElement | undefined;
  if (typeof document !== 'undefined') {
    const el = document.querySelector<HTMLMetaElement>('meta[name="emotion-insertion-point"]');
    if (el) insertionPoint = el as unknown as HTMLElement;
  }
  return createCache({ key: 'mui', insertionPoint, prepend: true });
}

export const EmotionCacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cache] = useState(() => createEmotionCache());
  return <CacheProvider value={cache}>{children}</CacheProvider>;
};

export default EmotionCacheProvider;

"use client";

import React, { useMemo } from 'react';
import { ThemeProvider, createTheme, CssBaseline, responsiveFontSizes } from '@mui/material';

/**
 * AppThemeProvider selects light/dark mode from system preference and
 * adjusts certain design tokens for mobile (compact spacing & font sizes).
 */
export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Plain light-only theme (remove all dark styling logic)
  const base = useMemo(() => createTheme({
    palette: {
      mode: 'light',
      background: { default: '#ffffff', paper: '#ffffff' },
    },
    shape: { borderRadius: 6 },
  }), []);

  const themed = useMemo(() => {
    let t = createTheme(base, {
      typography: {
        fontFamily: 'var(--font-geist-sans), Roboto, Helvetica, Arial, sans-serif',
        h5: { fontWeight: 600 },
      },
      components: {
        MuiContainer: { defaultProps: { maxWidth: 'lg' } },
        MuiCssBaseline: {
          styleOverrides: (theme: any) => ({
            html: { height: '100%', backgroundColor: '#ffffff' },
            body: { backgroundColor: '#ffffff', minHeight: '100%', margin: 0, color: theme.palette.text.primary },
            '#__next, body > div[data-role="app-root"]': { minHeight: '100%', display: 'flex', flexDirection: 'column' },
          }),
        },
        MuiPaper: {
          styleOverrides: { root: { backgroundImage: 'none' } },
        },
        MuiDataGrid: {
          styleOverrides: {
            root: ({ theme }) => ({
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
            }),
            columnHeaders: ({ theme }) => ({
              backgroundColor: '#f5f5f5',
              borderBottom: `1px solid ${theme.palette.divider}`,
            }),
          },
        },
      },
    });
    t = responsiveFontSizes(t);
    return t;
  }, [base]);

  return (
    <ThemeProvider theme={themed}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

export default AppThemeProvider;

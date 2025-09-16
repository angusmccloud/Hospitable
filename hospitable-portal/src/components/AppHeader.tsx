"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Box,
  Divider,
  Stack,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import HomeIcon from '@mui/icons-material/SpaceDashboard';
import PeopleIcon from '@mui/icons-material/People';
import EventNoteIcon from '@mui/icons-material/EventNote';
import { signOut } from 'aws-amplify/auth';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Metrics', href: '/', icon: <HomeIcon fontSize="small" /> },
  { label: 'Guests', href: '/guests', icon: <PeopleIcon fontSize="small" /> },
  { label: 'Reservations', href: '/reservations', icon: <EventNoteIcon fontSize="small" /> },
];

export const AppHeader: React.FC = () => {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    try { await signOut(); } finally { window.location.href = process.env.NEXT_PUBLIC_REDIRECT_SIGNOUT_URL || '/'; }
  };

  return (
    <>
      <AppBar position="fixed">
        <Toolbar sx={{ gap: 2 }}>          
          <IconButton
            edge="start"
            color="inherit"
            aria-label="menu"
            onClick={() => setOpen(true)}
            sx={{ display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component={Link} href="/" style={{ textDecoration: 'none', flexGrow: { xs: 1, md: 0 } as any }}>
            Hospitable Portal
          </Typography>
          <Stack direction="row" spacing={1} sx={{ ml: 4, display: { xs: 'none', md: 'flex' }, flexGrow: 1 }}>
            {navItems.map(item => (
              <Button
                key={item.href}
                component={Link}
                href={item.href}
                color={pathname === item.href ? 'primary' : 'inherit'}
                variant={pathname === item.href ? 'contained' : 'text'}
                size="small"
                startIcon={item.icon as any}
              >
                {item.label}
              </Button>
            ))}
          </Stack>
          <Button onClick={handleSignOut} color="inherit" startIcon={<LogoutIcon fontSize="small" />}>Sign out</Button>
        </Toolbar>
      </AppBar>
      <Toolbar /> {/* spacer for fixed app bar */}
      <Drawer anchor="left" open={open} onClose={() => setOpen(false)} sx={{ display: { md: 'none' } }}>
        <Box role="presentation" sx={{ width: 240, pt: 1 }}>
          <Typography variant="subtitle1" sx={{ px: 2, pb: 1, fontWeight: 600 }}>Navigation</Typography>
          <Divider />
          <List>
            {navItems.map(item => (
              <ListItemButton
                key={item.href}
                component={Link}
                href={item.href}
                selected={pathname === item.href}
                onClick={() => setOpen(false)}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
            <Divider sx={{ my: 1 }} />
            <ListItemButton onClick={handleSignOut}>
              <ListItemText primary="Sign out" />
            </ListItemButton>
          </List>
        </Box>
      </Drawer>
    </>
  );
};

export default AppHeader;

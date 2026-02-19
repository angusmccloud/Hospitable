import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthGate from "../components/AuthGate";
import { AppQueryProvider } from "../providers/query-client";
import AppThemeProvider from "../providers/theme";
import EmotionCacheProvider from "../providers/emotion-cache";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hospitable CRM",
  description: "Property management CRM portal",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="emotion-insertion-point" content="" />
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
        <div data-role="app-root" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <EmotionCacheProvider>
            <AppQueryProvider>
              <AppThemeProvider>
                  <AuthGate>
                    {children}
                  </AuthGate>
              </AppThemeProvider>
            </AppQueryProvider>
          </EmotionCacheProvider>
        </div>
      </body>
    </html>
  );
}

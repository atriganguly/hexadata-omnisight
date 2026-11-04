import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HexaData OmniSight | Real-Time Telemetry & Control Engine',
  description: 'Zero-Config Real-Time Observability and Control Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-darkBg min-h-screen text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}

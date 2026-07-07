import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ToastContainer from '@/components/Toast/ToastContainer';

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DomStaX | Faculty Management",
  description: "Modern faculty management platform for attendance, schedules, clearance, and academic operations.",
  icons: {
    icon: "/domstaxlogo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} min-h-screen bg-background text-foreground antialiased`}>
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
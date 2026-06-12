import type { Metadata } from "next";
import { Bitter, DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const bitter = Bitter({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Begùme",
  description: "Guess the country behind each dish.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${bitter.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WolLu Game - 월급루팡게임",
  description: "Play the ultimate Word Chain game with your friends online.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

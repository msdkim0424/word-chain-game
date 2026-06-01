import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "끝말잇기 - Multiplayer Word Chain",
  description: "Play the classic Korean word chain game with your friends online.",
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

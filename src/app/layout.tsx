import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ok.lol",
  description: "An always-on proactive AI that does things for you on your computer(s).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

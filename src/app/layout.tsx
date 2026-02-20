import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Member Registration | Canteen 375",
  description: "Official membership registration for Canteen 375 Plaza Unipdu. Join our community and collect points on every purchase.",
  icons: {
    icon: "/Logo Canteen 375 (2).png",
    apple: "/Logo Canteen 375 (2).png",
  }
};

import { MemberProvider } from "@/context/MemberContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body>
        <MemberProvider>
          {children}
        </MemberProvider>
      </body>
    </html>
  );
}

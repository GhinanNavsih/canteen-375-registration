import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Member Registration | Canteen 375",
  description: "Official membership registration for Canteen 375 Plaza Unipdu. Join our community and collect points on every purchase.",
  manifest: "/manifest.json",
  themeColor: "#5d4037",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Canteen 375",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-512.png",
  },
};

import { MemberProvider } from "@/context/MemberContext";
import { BasketProvider } from "@/context/BasketContext";
import StyledJsxRegistry from "./registry";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body suppressHydrationWarning>
        <StyledJsxRegistry>
          <MemberProvider>
            <BasketProvider>
              {children}
              <ServiceWorkerRegistrar />
            </BasketProvider>
          </MemberProvider>
        </StyledJsxRegistry>
      </body>
    </html>
  );
}

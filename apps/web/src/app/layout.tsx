"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      })
  );

  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

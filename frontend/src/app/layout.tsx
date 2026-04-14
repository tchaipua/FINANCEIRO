import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import RootShell from "@/app/components/root-shell";

export const metadata: Metadata = {
  title: "Financeiro Core",
  description: "Painel operacional do core financeiro",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <Suspense fallback={<div className="min-h-screen">{children}</div>}>
          <RootShell>{children}</RootShell>
        </Suspense>
      </body>
    </html>
  );
}

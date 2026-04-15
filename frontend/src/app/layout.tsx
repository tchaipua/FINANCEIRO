import type { Metadata } from "next";
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
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}

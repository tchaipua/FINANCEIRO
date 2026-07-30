import type { Metadata } from "next";
import "./globals.css";
import RootShell from "@/app/components/root-shell";
import GlobalProcessingOverlay from "@/app/components/global-processing-overlay";
import SystemMessageProvider from "@/app/components/system-message-provider";
import PerformanceMeasureGuard from "@/app/components/performance-measure-guard";

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
        <PerformanceMeasureGuard />
        <SystemMessageProvider><GlobalProcessingOverlay /><RootShell>{children}</RootShell></SystemMessageProvider>
      </body>
    </html>
  );
}

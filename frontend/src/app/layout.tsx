import type { Metadata } from "next";
import Script from "next/script";
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
        <Script id="performance-measure-guard" strategy="beforeInteractive">
          {`
            (function () {
              if (typeof performance === 'undefined' || !performance.measure || performance.__msinforMeasureGuard) return;
              var originalMeasure = performance.measure.bind(performance);
              performance.measure = function () {
                try {
                  return originalMeasure.apply(performance, arguments);
                } catch (error) {
                  var message = String(error && error.message || '');
                  var measureName = String(arguments && arguments[0] || '');
                  if (message.indexOf('negative time stamp') >= 0 && measureName.indexOf('Page') >= 0) {
                    return undefined;
                  }
                  throw error;
                }
              };
              performance.__msinforMeasureGuard = true;
            })();
          `}
        </Script>
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}

import type { NextConfig } from "next";

function resolveBasePath() {
  const configuredValue = process.env.NEXT_PUBLIC_FINANCEIRO_BASE_PATH;
  const value =
    configuredValue === undefined
      ? process.env.NODE_ENV === "production"
        ? "/financeiro-app"
        : ""
      : configuredValue.trim();

  if (!value) return "";
  if (
    !/^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(value) ||
    value.endsWith("/") ||
    value.includes("//") ||
    value.split("/").includes("..")
  ) {
    throw new Error(
      "NEXT_PUBLIC_FINANCEIRO_BASE_PATH deve ser vazio ou um caminho absoluto sem barra final, como /financeiro-app.",
    );
  }
  return value;
}

const basePath = resolveBasePath();
const deploymentId = process.env.FINANCEIRO_FRONTEND_DEPLOYMENT_ID || 'financeiro-local-grid-icons-v5';

const nextConfig: NextConfig = {
  basePath,
  deploymentId,
  output: "standalone",
  env: {
    NEXT_PUBLIC_FINANCEIRO_BASE_PATH: basePath,
  },
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
          },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

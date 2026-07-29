import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen Docker chica: el build emite .next/standalone con su propio server.js.
  output: "standalone",

  // La app corre detras de nada (puerto 3100 directo en la LAN), asi que los
  // headers de seguridad los pone Next.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;

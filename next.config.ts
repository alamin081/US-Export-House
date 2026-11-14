import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Importing the env module here makes `next dev`, `next build` and `next start`
// fail immediately when a required secret is missing or unsafe for the target
// environment, instead of failing later at request time (spec section 2, rule 6).
// (relative path: the `@/*` alias is not available inside next.config.ts)
import { env } from "./src/config/env";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Native modules must be loaded by Node at runtime, not bundled.
  serverExternalPackages: ["@node-rs/argon2"],

  // Pin the Turbopack workspace root: the project lives under the user's home
  // directory, and without this Turbopack walks up and warns about lockfiles
  // outside the project.
  turbopack: { root: import.meta.dirname },

  // Fail the build on type errors rather than shipping them. Next.js 16 no
  // longer runs ESLint during `next build`, so `npm run lint` (and CI) owns it.
  typescript: { ignoreBuildErrors: false },

  // The E2E suite builds into its own folder so it never overwrites `.next`.
  ...(process.env.NEXT_DIST_DIR === undefined ? {} : { distDir: process.env.NEXT_DIST_DIR }),

  images: {
    formats: ["image/avif", "image/webp"],
    // Product images: only this account's Cloudinary delivery path.
    remotePatterns:
      env.CLOUDINARY_CLOUD_NAME === undefined || env.CLOUDINARY_CLOUD_NAME === ""
        ? []
        : [
            {
              protocol: "https",
              hostname: "res.cloudinary.com",
              pathname: `/${env.CLOUDINARY_CLOUD_NAME}/image/upload/**`,
            },
          ],
    // Local images: the static placeholders and the development mock storage.
    localPatterns: [{ pathname: "/images/**" }, { pathname: "/api/dev-uploads/**" }],
  },

  // Applied to every response. CSP is added in Phase 13 together with the
  // final list of third-party origins (payment gateway, image CDN, analytics).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);

import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)
import { redirects } from './redirects'

const NEXT_PUBLIC_SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

const nextConfig: NextConfig = {
  // Next refuses to run two dev servers for the same project directory, and the
  // lock lives under the build directory. Giving the e2e server its own means
  // the suite can run without first killing whatever dev server you have open.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Temporarily required on Windows until Next.js fixes Turbopack Sass resolution.
  // See: https://github.com/vercel/next.js/issues/86431
  sassOptions: {
    loadPaths: ['./node_modules/@payloadcms/ui/dist/scss/'],
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
    qualities: [90, 100],
    remotePatterns: [
      ...[NEXT_PUBLIC_SERVER_URL /* 'https://example.com' */].map((item) => {
        const url = new URL(item)

        return {
          hostname: url.hostname,
          // The port MUST be included. Next matches remote patterns on port
          // too, and an omitted port only matches URLs served on the protocol
          // default (80/443). Without this, every product image 400s from the
          // image optimiser in local dev — and on any deployment that does not
          // sit on a default port.
          port: url.port,
          protocol: url.protocol.replace(':', '') as 'http' | 'https',
        }
      }),
    ],
  },
  reactStrictMode: true,
  // Static-export worker count. Each worker opens its own Payload Postgres
  // pool (capped at 5 in payload.config.ts); 6 × 5 stays well inside
  // Postgres's default 100-connection limit even with a dev server running.
  experimental: {
    cpus: 6,
  },
  redirects,
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig)

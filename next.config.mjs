const basePath = process.env.BASE_PATH || undefined

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath || "",
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig

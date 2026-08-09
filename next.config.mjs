/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["@azure/monitor-opentelemetry"],
  images: {
    unoptimized: true,
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.(?:md|sql)$/,
      type: "asset/source",
    })
    return config
  },
}

export default nextConfig

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  webpack(config) {
    config.module.rules.push({
      test: /\.(?:md|sql)$/,
      type: "asset/source",
    })
    return config
  },
}

export default nextConfig

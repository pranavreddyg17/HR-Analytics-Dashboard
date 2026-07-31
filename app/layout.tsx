import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import "./globals.css"


const baseMetadata: Metadata = {
  title: {
    default: "LaidbackHR.AI — HR Operations",
    template: "%s · LaidbackHR.AI",
  },
  description:
    "HR operations, workforce reporting, and governed AI tools for employee records, hiring, time off, and learning.",
  applicationName: "LaidbackHR.AI",
  generator: "LaidbackHR.AI",
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers()
  const hostCandidate = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "").split(",")[0].trim()
  const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(hostCandidate) ? hostCandidate : "localhost:3000"
  const forwardedProtocol = (requestHeaders.get("x-forwarded-proto") ?? "").split(",")[0].trim()
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : host.startsWith("localhost") ? "http" : "https"
  const imageUrl = `${protocol}://${host}/og-v3.png`

  return {
    ...baseMetadata,
    openGraph: {
      title: "LaidbackHR.AI — HR Operations",
      description: "HR operations, workforce reporting, and governed AI tools.",
      type: "website",
      images: [{ url: imageUrl, width: 1672, height: 941, alt: "LaidbackHR.AI HR operations dashboard" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "LaidbackHR.AI — HR Operations",
      description: "HR operations, workforce reporting, and governed AI tools.",
      images: [imageUrl],
    },
  }
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#0b3155",
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}

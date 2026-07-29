import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import "@fontsource-variable/manrope"
import "./globals.css"


const baseMetadata: Metadata = {
  title: {
    default: "LaidbackHR.AI — People Operations",
    template: "%s · LaidbackHR.AI",
  },
  description:
    "A connected people operations workspace for employee records, hiring, time off, learning, workforce insights, and responsible AI assistance.",
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
      title: "LaidbackHR.AI — People Operations",
      description: "People operations and workforce intelligence, clearly connected.",
      type: "website",
      images: [{ url: imageUrl, width: 1672, height: 941, alt: "LaidbackHR.AI — people operations, clearly connected" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "LaidbackHR.AI — People Operations",
      description: "People operations and workforce intelligence, clearly connected.",
      images: [imageUrl],
    },
  }
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#0b1020",
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

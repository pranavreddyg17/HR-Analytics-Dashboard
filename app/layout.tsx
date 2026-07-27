import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import "@fontsource-variable/manrope"
import "@fontsource-variable/newsreader"
import "./globals.css"


const baseMetadata: Metadata = {
  title: {
    default: "LaidbackHR.AI — People Operations",
    template: "%s · LaidbackHR.AI",
  },
  description:
    "A calm people operations workspace for employee records, hiring, time off, growth, workforce insights, and responsible AI assistance.",
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
  const imageUrl = `${protocol}://${host}/og-v2.png`

  return {
    ...baseMetadata,
    openGraph: {
      title: "LaidbackHR.AI — People Operations",
      description: "Employee management and workforce intelligence in one calm workspace.",
      type: "website",
      images: [{ url: imageUrl, width: 1672, height: 941, alt: "LaidbackHR.AI — calm people operations, powered by grounded intelligence" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "LaidbackHR.AI — People Operations",
      description: "Employee management and workforce intelligence in one calm workspace.",
      images: [imageUrl],
    },
  }
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f6f7f2",
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

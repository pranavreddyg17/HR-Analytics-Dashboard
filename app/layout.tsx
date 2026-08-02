import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "LaidbackHR.AI — HR Operations",
    template: "%s · LaidbackHR.AI",
  },
  description:
    "HR operations, workforce reporting, and governed AI tools for employee records, hiring, time off, and learning.",
  applicationName: "LaidbackHR.AI",
  generator: "LaidbackHR.AI",
  openGraph: {
    title: "LaidbackHR.AI — HR Operations",
    description: "HR operations, workforce reporting, and governed AI tools.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "LaidbackHR.AI — HR Operations",
    description: "HR operations, workforce reporting, and governed AI tools.",
  },
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

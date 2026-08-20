import type { Metadata, Viewport } from "next"
import { AppMotionProvider } from "@/components/motion/motion-provider"
import "./globals.css"

export const metadata: Metadata = {
  title: "LaidBackHR.ai",
  description:
    "HR operations, workforce reporting, and governed AI tools for employee records, hiring, time off, and learning.",
  applicationName: "LaidBackHR.ai",
  generator: "LaidBackHR.ai",
  openGraph: {
    title: "LaidBackHR.ai",
    description: "HR operations, workforce reporting, and governed AI tools.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "LaidBackHR.ai",
    description: "HR operations, workforce reporting, and governed AI tools.",
  },
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#17131f",
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <AppMotionProvider>{children}</AppMotionProvider>
      </body>
    </html>
  )
}

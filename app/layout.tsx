import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import './globals.css'

import { AppSidebar } from '@/components/app-sidebar'
import { Topbar } from '@/components/topbar'

const baseMetadata: Metadata = {
  title: {
    default: 'LaidbackHR.AI — People Intelligence',
    template: '%s · LaidbackHR.AI',
  },
  description:
    'Workforce intelligence across hiring, attrition, leave, training, and promotions with persistent HR data, explainable predictions, and MCP-powered AI.',
  applicationName: 'LaidbackHR.AI',
  generator: 'LaidbackHR.AI',
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers()
  const hostCandidate = (requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? '').split(',')[0].trim()
  const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(hostCandidate) ? hostCandidate : 'localhost:3000'
  const forwardedProtocol = (requestHeaders.get('x-forwarded-proto') ?? '').split(',')[0].trim()
  const protocol = forwardedProtocol === 'http' || forwardedProtocol === 'https'
    ? forwardedProtocol
    : host.startsWith('localhost') ? 'http' : 'https'
  const imageUrl = `${protocol}://${host}/og.png`

  return {
    ...baseMetadata,
    openGraph: {
      title: 'LaidbackHR.AI — People Intelligence',
      description: 'Persistent workforce analytics and human-reviewed MCP agent workflows.',
      type: 'website',
      images: [{ url: imageUrl, width: 1731, height: 909, alt: 'LaidbackHR.AI — People Intelligence' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'LaidbackHR.AI — People Intelligence',
      description: 'Persistent workforce analytics and human-reviewed MCP agent workflows.',
      images: [imageUrl],
    },
  }
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#1a1f26',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark bg-background">
      <body className="font-sans antialiased">
        <div className="flex min-h-screen">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 p-4 pb-24 sm:p-5 sm:pb-24 md:pb-5">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}

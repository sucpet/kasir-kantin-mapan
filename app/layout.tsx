import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kasir Kantin',
  description: 'Aplikasi kasir untuk kantin',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  )
}

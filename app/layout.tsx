import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kasir Kantin',
  description: 'Aplikasi kasir untuk kantin',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="h-full">
      <head>
        {/* Apply saved theme before paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("theme");if(t==="light")document.documentElement.classList.add("light")}catch(e){}` }} />
      </head>
      <body className="h-full">{children}</body>
    </html>
  )
}

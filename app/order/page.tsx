'use client'
import type { CSSProperties } from 'react'
import dynamic from 'next/dynamic'

// Client-only: state awal dibaca dari sessionStorage, jadi SSR selalu mismatch
const OrderPage = dynamic(() => import('./OrderPage'), { ssr: false })

const scale = { '--fs': 1.2, fontSize: 'calc(14px * var(--fs))' } as CSSProperties

export default function Page() {
  return (
    <div className="contents" style={scale}>
      <OrderPage />
    </div>
  )
}

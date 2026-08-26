'use client'
import { useEffect } from 'react'

interface ModalProps {
  onClose: () => void
  children: React.ReactNode
  center?: boolean
}

export default function Modal({ onClose, children, center }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/50 ${center ? 'items-center p-4' : 'items-end'}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`w-full max-w-md max-h-[92vh] overflow-y-auto bg-white p-5 animate-in duration-200 ${center ? 'rounded-2xl slide-in-from-bottom-2' : 'rounded-t-2xl slide-in-from-bottom-4'}`}>
        {!center && <div className="w-9 h-1 bg-[var(--color-border)] rounded-full mx-auto mb-4" />}
        {children}
      </div>
    </div>
  )
}

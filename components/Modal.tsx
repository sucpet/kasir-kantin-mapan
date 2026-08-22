'use client'
import { useEffect } from 'react'

interface ModalProps {
  onClose: () => void
  children: React.ReactNode
}

export default function Modal({ onClose, children }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl p-5 animate-in slide-in-from-bottom-4 duration-200">
        <div className="w-9 h-1 bg-[var(--color-border)] rounded-full mx-auto mb-4" />
        {children}
      </div>
    </div>
  )
}

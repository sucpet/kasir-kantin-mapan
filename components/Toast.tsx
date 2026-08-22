'use client'
import { useEffect, useRef, useState } from 'react'

interface ToastProps {
  message: string
  onDone: () => void
}

export function Toast({ message, onDone }: ToastProps) {
  const [visible, setVisible] = useState(true)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(false), 1900)
    const t2 = setTimeout(() => onDoneRef.current(), 2200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, []) // intentionally empty — timers hanya jalan sekali saat mount

  return (
    <div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] pointer-events-none
        bg-[#1C2420] text-white px-5 py-2.5 rounded-full text-[13px] font-semibold
        whitespace-nowrap transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {message}
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  const show = (msg: string) => setToast(msg)
  const node = toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null
  return { show, node }
}

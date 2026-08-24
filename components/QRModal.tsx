'use client'
import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import Modal from '@/components/Modal'

export default function QRModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    setUrl(window.location.origin + '/order')
  }, [])

  return (
    <Modal onClose={onClose}>
      <h2 className="text-[16px] font-extrabold text-center mb-1">QR Pesan Mandiri</h2>
      <p className="text-[12px] text-[var(--color-muted)] text-center mb-4 px-2">
        Tunjukkan ke pelanggan — mereka scan untuk pesan sendiri
      </p>
      <div className="flex justify-center mb-4 p-4 bg-white rounded-xl">
        {url && <QRCodeSVG value={url} size={200} fgColor="#1C2420" />}
      </div>
      <div className="bg-[var(--color-surface2)] rounded-lg px-3 py-2 mb-4 border border-[var(--color-border)]">
        <p className="text-[10px] text-[var(--color-muted)] break-all text-center font-mono">{url}</p>
      </div>
      <button
        onClick={onClose}
        className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
      >
        Tutup
      </button>
    </Modal>
  )
}

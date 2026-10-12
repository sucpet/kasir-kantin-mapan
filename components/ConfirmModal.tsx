'use client'
import Modal from '@/components/Modal'

interface ConfirmModalProps {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Ya, Lanjutkan',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal onClose={onCancel}>
      <div className="text-center mb-5">
        <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 text-2xl
          ${danger ? 'bg-[var(--color-danger-light)]' : 'bg-[var(--color-primary-light)]'}`}>
          {danger ? '🗑️' : '❓'}
        </div>
        <h2 className="text-[length:calc(16px*var(--fs))] font-extrabold">{title}</h2>
        {message && <p className="text-[length:calc(13px*var(--fs))] text-[var(--color-muted)] mt-1">{message}</p>}
      </div>
      <button
        onClick={onConfirm}
        className={`w-full py-2.5 rounded-lg text-[length:calc(13px*var(--fs))] font-bold text-white mb-2 transition-colors
          ${danger ? 'bg-[var(--color-danger)] hover:opacity-90' : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-mid)]'}`}
      >
        {confirmLabel}
      </button>
      <button
        onClick={onCancel}
        className="w-full py-2.5 rounded-lg text-[length:calc(13px*var(--fs))] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
      >
        Batal
      </button>
    </Modal>
  )
}

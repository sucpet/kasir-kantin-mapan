'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Order } from '@/lib/types'
import { rp, qrisAmount, kembalian } from '@/lib/utils'
import Modal from '@/components/Modal'

const PECAHAN = [5000, 10000, 20000, 50000, 100000]

interface Props {
  order: Order
  onClose: () => void
  onPaid: (o: Order) => void
  onToast: (msg: string) => void
}

export default function PayModal({ order, onClose, onPaid, onToast }: Props) {
  const [cash, setCash] = useState(0)
  const [saving, setSaving] = useState(false)
  const qris = qrisAmount(order)
  const change = kembalian(order.total, cash)

  async function pay(method: 'QRIS' | 'Tunai', paid: number) {
    setSaving(true)
    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid', paid_amount: paid, paid_at: new Date().toISOString(), payment_method: method })
      .eq('id', order.id)
      .eq('status', 'open')
    setSaving(false)
    if (error) { onToast('Gagal menyimpan pembayaran'); return }
    onPaid({ ...order, status: 'paid', paid_amount: paid, payment_method: method })
  }

  const label = `#${order.queue_no ?? '–'}${order.customer_name !== 'Tamu' ? ` · ${order.customer_name}` : ''}`

  return (
    <Modal onClose={onClose}>
      <h2 className="text-[length:calc(18px*var(--fs))] font-extrabold text-center">💰 Lunas</h2>
      <p className="text-center text-[length:calc(14px*var(--fs))] font-bold text-[var(--color-muted)] mb-3">{label}</p>
      <div className="flex justify-between items-center bg-[var(--color-primary-light)] rounded-xl px-4 py-3 mb-4">
        <span className="text-[length:calc(14px*var(--fs))] font-bold">Total</span>
        <span className="text-[length:calc(22px*var(--fs))] font-extrabold tabular-nums text-[var(--color-primary)]">{rp(order.total)}</span>
      </div>

      <button onClick={() => pay('QRIS', qris)} disabled={saving}
        className="w-full py-4 rounded-xl bg-[var(--color-info)] text-white text-[length:calc(16px*var(--fs))] font-extrabold mb-1 disabled:opacity-50">
        📱 Bayar QRIS {rp(qris)}
      </button>
      {qris !== order.total && (
        <p className="text-[length:calc(11px*var(--fs))] text-[var(--color-muted)] text-center mb-1">Nominal termasuk kode unik. Cek dulu di histori QRIS.</p>
      )}

      <div className="flex items-center gap-2 my-4 text-[length:calc(12px*var(--fs))] font-bold text-[var(--color-muted)] uppercase tracking-wider">
        <span className="flex-1 h-px bg-[var(--color-border)]" />atau Tunai<span className="flex-1 h-px bg-[var(--color-border)]" />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {PECAHAN.map(n => (
          <button key={n} onClick={() => setCash(c => c + n)}
            className="py-3 rounded-xl border-[1.5px] border-[var(--color-success)] text-[var(--color-success)] bg-[var(--color-success-light)] text-[length:calc(15px*var(--fs))] font-extrabold tabular-nums active:scale-95 transition-transform">
            +{n.toLocaleString('id-ID')}
          </button>
        ))}
        <button onClick={() => setCash(0)} disabled={cash === 0}
          className="py-3 rounded-xl border-[1.5px] border-[var(--color-danger)] text-[var(--color-danger)] bg-[var(--color-danger-light)] text-[length:calc(14px*var(--fs))] font-extrabold leading-tight disabled:opacity-40">
          ✕ Hapus Nominal
        </button>
      </div>

      <label className="block text-[length:calc(12px*var(--fs))] font-bold text-[var(--color-muted)] mb-1">Uang diterima</label>
      <input type="text" inputMode="numeric"
        value={cash ? cash.toLocaleString('id-ID') : ''}
        onChange={e => setCash(Number(e.target.value.replace(/\D/g, '')) || 0)}
        placeholder="0"
        className="w-full px-4 py-3 border-[1.5px] border-[var(--color-border)] rounded-xl text-[length:calc(20px*var(--fs))] font-extrabold tabular-nums text-right outline-none bg-transparent text-[var(--color-text)] focus:border-[var(--color-primary)] mb-3" />

      {cash > 0 && (
        <div className={`flex justify-between items-center rounded-xl px-4 py-3 mb-3 ${change >= 0 ? 'bg-[var(--color-success-light)] text-[var(--color-success)]' : 'bg-[var(--color-danger-light)] text-[var(--color-danger)]'}`}>
          <span className="text-[length:calc(15px*var(--fs))] font-bold">{change >= 0 ? 'Kembalian' : 'Uang kurang'}</span>
          <span className="text-[length:calc(26px*var(--fs))] font-extrabold tabular-nums">{rp(Math.abs(change))}</span>
        </div>
      )}

      <button onClick={() => pay('Tunai', cash)} disabled={saving || change < 0}
        className="w-full py-4 rounded-xl bg-[var(--color-success)] text-white text-[length:calc(16px*var(--fs))] font-extrabold mb-2 disabled:opacity-40">
        {saving ? 'Menyimpan...' : '✅ Simpan Bayar Tunai'}
      </button>
      <button onClick={onClose}
        className="w-full py-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[length:calc(14px*var(--fs))] font-semibold text-[var(--color-muted)]">
        Batal
      </button>
    </Modal>
  )
}

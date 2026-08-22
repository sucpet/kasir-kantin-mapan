'use client'
import { useState, useEffect, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Order } from '@/lib/types'
import { rp, fmtTime, orderSum } from '@/lib/utils'
import Modal from '@/components/Modal'

interface PesananTabProps {
  onToast: (msg: string) => void
  refreshKey: number
}

export default function PesananTab({ onToast, refreshKey }: PesananTabProps) {
  const [orders, setOrders] = useState<Order[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [settleModal, setSettleModal] = useState<Order | null>(null)
  const [paidAmount, setPaidAmount] = useState('')
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    if (data) setOrders(data)
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders, refreshKey])

  useEffect(() => {
    const sub = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchOrders)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [fetchOrders])

  async function confirmSettle(order: Order) {
    setLoading(true)
    const paid = Number(paidAmount) || order.total
    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid', paid_amount: paid, paid_at: new Date().toISOString() })
      .eq('id', order.id)
    if (error) { onToast('Gagal memperbarui pesanan'); setLoading(false); return }
    setOrders(prev => prev.filter(o => o.id !== order.id))
    setSettleModal(null)
    setExpanded(null)
    setPaidAmount('')
    setLoading(false)
    setReceiptOrder({ ...order, status: 'paid', paid_amount: paid })
  }

  function buildReceipt(o: Order): string {
    const line = '--------------------------------'
    let r = `KASIR KANTIN\n${line}\nPelanggan : ${o.customer_name}\nWaktu     : ${fmtTime(o.created_at)}\n${line}\n`
    o.order_items?.forEach(i => { r += `${i.name}\n  ${i.qty} x ${rp(i.price).padEnd(12)}${rp(i.price * i.qty)}\n` })
    r += `${line}\nTOTAL     : ${rp(o.total)}\n`
    if (o.status === 'paid') {
      r += `BAYAR     : ${rp(o.paid_amount ?? o.total)}\nKEMBALI   : ${rp(Math.max(0, (o.paid_amount ?? o.total) - o.total))}\n`
    } else {
      r += `STATUS    : BELUM DIBAYAR\n`
    }
    r += `${line}\n      Terima kasih! 😊`
    return r
  }

  function doPrint(o: Order) {
    const pz = document.getElementById('print-zone')
    if (pz) pz.textContent = buildReceipt(o)
    window.print()
  }

  const change = settleModal ? Math.max(0, Number(paidAmount) - settleModal.total) : 0

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="bg-white border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <span className="text-[14px] font-extrabold">Pesanan Berjalan</span>
        <span className="text-[12px] text-[var(--color-muted)]">{orders.length} aktif</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-[var(--color-muted)]">
            <span className="text-4xl">✅</span>
            <span className="text-[13px] font-bold text-[#1C2420]">Tidak ada pesanan terbuka</span>
            <span className="text-xs">Semua tab sudah lunas</span>
          </div>
        )}

        {orders.map(order => {
          const isExp = expanded === order.id
          const itemCount = order.order_items?.reduce((s, i) => s + i.qty, 0) ?? 0
          return (
            <div key={order.id} className="bg-white border-[1.5px] border-[var(--color-border)] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(20,35,25,0.08)]">
              <div
                className="flex items-center gap-3 px-3.5 py-3 cursor-pointer select-none hover:bg-[var(--color-surface2)] transition-colors"
                onClick={() => setExpanded(isExp ? null : order.id)}
              >
                <div className="flex-1">
                  <div className="text-[14px] font-bold">👤 {order.customer_name}</div>
                  <div className="text-[11px] text-[var(--color-muted)] mt-0.5">{fmtTime(order.created_at)} · {itemCount} item</div>
                </div>
                <div className="text-right">
                  <div className="text-[14px] font-extrabold text-[var(--color-primary)] tabular-nums">{rp(order.total)}</div>
                  <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-accent-light)] text-[#8a4a00]">Tab Terbuka</span>
                </div>
                <ChevronDown size={14} className={`text-[var(--color-muted)] transition-transform ${isExp ? 'rotate-180' : ''}`} />
              </div>

              {isExp && (
                <>
                  <div className="border-t border-[var(--color-border-lt)] bg-[var(--color-surface2)] px-3.5 py-2.5">
                    {order.order_items?.map(i => (
                      <div key={i.id} className="flex justify-between text-[12px] py-0.5">
                        <span>{i.name} ×{i.qty}</span>
                        <span className="text-[var(--color-muted)] tabular-nums">{rp(i.price * i.qty)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-[13px] font-extrabold mt-2 pt-2 border-t border-[var(--color-border)]">
                      <span>Total</span><span>{rp(order.total)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 px-3.5 py-2 border-t border-[var(--color-border-lt)]">
                    <button onClick={() => { setSettleModal(order); setPaidAmount('') }}
                      className="flex-1 py-1.5 text-[12px] font-bold text-white bg-[var(--color-success)] rounded-lg hover:bg-[#1f6440] transition-colors">
                      💳 Bayar
                    </button>
                    <button onClick={() => setReceiptOrder(order)}
                      className="px-3 py-1.5 text-[12px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] rounded-lg hover:text-[#1C2420] transition-colors">
                      🖨️
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Settle modal */}
      {settleModal && (
        <Modal onClose={() => { setSettleModal(null); setPaidAmount('') }}>
          <h2 className="text-[16px] font-extrabold text-center mb-4">💳 Bayar Tab: {settleModal.customer_name}</h2>
          <div className="bg-[var(--color-primary-light)] rounded-[10px] p-3.5 mb-4">
            {settleModal.order_items?.map(i => (
              <div key={i.id} className="flex justify-between text-[12px] py-0.5 tabular-nums">
                <span>{i.name} ×{i.qty}</span><span>{rp(i.price * i.qty)}</span>
              </div>
            ))}
            <div className="flex justify-between text-[16px] font-extrabold text-[var(--color-primary)] mt-2 pt-2 border-t border-[#afd0bc] tabular-nums">
              <span>TOTAL</span><span>{rp(settleModal.total)}</span>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1">Uang Diterima</label>
            <input type="number" inputMode="numeric" value={paidAmount} onChange={e => setPaidAmount(e.target.value)}
              placeholder={String(settleModal.total)}
              className="w-full px-3 py-2 border-[1.5px] border-[var(--color-border)] rounded-lg text-[13px] outline-none focus:border-[var(--color-primary)]" />
            {paidAmount && (
              <div className={`flex justify-between text-[14px] font-extrabold mt-2 pt-2 border-t border-[var(--color-border)] tabular-nums ${change >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                <span>Kembalian</span><span>{rp(change)}</span>
              </div>
            )}
          </div>
          <button onClick={() => confirmSettle(settleModal)} disabled={loading}
            className="w-full py-2.5 rounded-lg text-[13px] font-bold text-white bg-[var(--color-success)] mb-1.5 disabled:opacity-50 hover:bg-[#1f6440] transition-colors">
            {loading ? 'Memproses...' : '✅ Konfirmasi Bayar'}
          </button>
          <button onClick={() => { setSettleModal(null); setPaidAmount('') }}
            className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[#1C2420] transition-colors">
            Batal
          </button>
        </Modal>
      )}

      {/* Receipt modal */}
      {receiptOrder && (
        <Modal onClose={() => setReceiptOrder(null)}>
          <h2 className="text-[16px] font-extrabold text-center mb-4">🧾 Struk Pesanan</h2>
          <pre className="font-mono text-[11px] leading-relaxed bg-[var(--color-surface2)] border border-dashed border-[var(--color-border)] rounded-lg p-3 overflow-x-auto whitespace-pre">
            {buildReceipt(receiptOrder)}
          </pre>
          <button onClick={() => doPrint(receiptOrder)} className="w-full py-2.5 rounded-lg text-[13px] font-bold bg-[var(--color-primary)] text-white mt-3 hover:bg-[var(--color-primary-mid)] transition-colors">
            🖨️ Print
          </button>
          <button onClick={() => setReceiptOrder(null)} className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] mt-1.5 hover:text-[#1C2420] transition-colors">
            Tutup
          </button>
        </Modal>
      )}

      <div id="print-zone" className="hidden" />
    </div>
  )
}

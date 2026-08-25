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
  onOrderSettled: () => void
}

export default function PesananTab({ onToast, refreshKey, onOrderSettled }: PesananTabProps) {
  const [orders, setOrders] = useState<Order[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [settleModal, setSettleModal] = useState<Order | null>(null)
  const [paidAmount, setPaidAmount] = useState('')
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null)
  const [newOrderAlert, setNewOrderAlert] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [payMethodError, setPayMethodError] = useState(false)

  const fetchOrders = useCallback(async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .gte('created_at', todayStart.toISOString())
      .order('status', { ascending: true })   // 'open' sebelum 'paid'
      .order('created_at', { ascending: false })
    if (data) setOrders(data)
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders, refreshKey])

  useEffect(() => {
    const sub = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
        fetchOrders()
        const newOrder = payload.new as Order
        if (newOrder.source === 'customer' && newOrder.status === 'open') {
          setTimeout(async () => {
            const { data } = await supabase
              .from('orders')
              .select('*, order_items(*)')
              .eq('id', newOrder.id)
              .single()
            if (data) setNewOrderAlert(data)
          }, 800)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchOrders)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [fetchOrders])

  async function confirmSettle(order: Order) {
    if (!paymentMethod) { setPayMethodError(true); return }
    setLoading(true)
    const paid = Number(paidAmount) || order.total
    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid', paid_amount: paid, paid_at: new Date().toISOString(), payment_method: paymentMethod })
      .eq('id', order.id)
    if (error) { onToast('Gagal memperbarui pesanan'); setLoading(false); return }
    fetchOrders()
    setSettleModal(null)
    setExpanded(null)
    setPaidAmount('')
    setPaymentMethod('')
    setPayMethodError(false)
    setLoading(false)
    onOrderSettled()
    setReceiptOrder({ ...order, status: 'paid', paid_amount: paid })
  }

  function buildReceipt(o: Order): string {
    const line = '--------------------------------'
    let r = `KASIR KANTIN\n${line}\nPelanggan : ${o.customer_name}\nWaktu     : ${fmtTime(o.created_at)}\n${line}\n`
    o.order_items?.forEach(i => {
      r += `${i.name}\n`
      if (i.note) r += `  * ${i.note}\n`
      r += `  ${i.qty} x ${rp(i.price).padEnd(12)}${rp(i.price * i.qty)}\n`
    })
    r += `${line}\nTOTAL     : ${rp(o.total)}\n`
    if (o.status === 'paid') {
      r += `BAYAR     : ${rp(o.paid_amount ?? o.total)}\nKEMBALI   : ${rp(Math.max(0, (o.paid_amount ?? o.total) - o.total))}\n`
      if (o.payment_method) r += `METODE    : ${o.payment_method}\n`
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
        <span className="text-[14px] font-extrabold">Pesanan Hari Ini</span>
        <span className="text-[12px] text-[var(--color-muted)]">
          {orders.filter(o => o.status === 'open').length} terbuka
          {orders.some(o => o.status === 'paid') && ` · ${orders.filter(o => o.status === 'paid').length} lunas`}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-[var(--color-muted)]">
            <span className="text-4xl">✅</span>
            <span className="text-[13px] font-bold text-[var(--color-text)]">Belum ada pesanan hari ini</span>
          </div>
        )}

        {orders.map(order => {
          const isExp = expanded === order.id
          const isPaid = order.status === 'paid'
          const itemCount = order.order_items?.reduce((s, i) => s + i.qty, 0) ?? 0
          return (
            <div key={order.id} className={`border-[1.5px] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(20,35,25,0.08)] ${isPaid ? 'bg-[var(--color-surface2)] border-[var(--color-border)]' : 'bg-white border-[var(--color-border)]'}`}>
              <div
                className="flex items-center gap-3 px-3.5 py-3 cursor-pointer select-none hover:bg-[var(--color-surface2)] transition-colors"
                onClick={() => setExpanded(isExp ? null : order.id)}
              >
                <div className="flex-1">
                  <div className={`text-[14px] font-bold ${isPaid ? 'text-[var(--color-muted)]' : ''}`}>👤 {order.customer_name}</div>
                  <div className="text-[11px] text-[var(--color-muted)] mt-0.5">
                    {fmtTime(order.created_at)} · {itemCount} item
                    {isPaid && order.payment_method && ` · ${order.payment_method}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-[14px] font-extrabold tabular-nums ${isPaid ? 'text-[var(--color-muted)]' : 'text-[var(--color-primary)]'}`}>{rp(order.total)}</div>
                  {isPaid
                    ? <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-success-light)] text-[var(--color-success)]">✓ Lunas</span>
                    : <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent-text)]">Tab Terbuka</span>
                  }
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
                    {isPaid && order.paid_amount != null && (
                      <div className="flex justify-between text-[12px] text-[var(--color-muted)] mt-0.5">
                        <span>Dibayar</span><span className="tabular-nums">{rp(order.paid_amount)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 px-3.5 py-2 border-t border-[var(--color-border-lt)]">
                    {!isPaid && (
                      <button onClick={() => { setSettleModal(order); setPaidAmount(''); setPaymentMethod(order.payment_method ?? ''); setPayMethodError(false) }}
                        className="flex-1 py-1.5 text-[12px] font-bold text-white bg-[var(--color-success)] rounded-lg hover:bg-[#1f6440] transition-colors">
                        💳 Bayar
                      </button>
                    )}
                    <button onClick={() => setReceiptOrder(order)}
                      className={`py-1.5 text-[12px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] rounded-lg hover:text-[var(--color-text)] transition-colors ${isPaid ? 'flex-1' : 'px-3'}`}>
                      🖨️ Print
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
        <Modal onClose={() => { setSettleModal(null); setPaidAmount(''); setPaymentMethod(''); setPayMethodError(false) }}>
          <h2 className="text-[16px] font-extrabold text-center mb-1">💳 Bayar</h2>
          <p className="text-center text-[13px] font-bold text-[var(--color-primary)] mb-4">{settleModal.customer_name}</p>
          <div className="bg-[var(--color-primary-light)] rounded-[10px] p-3.5 mb-4">
            {settleModal.order_items?.map(i => (
              <div key={i.id} className="py-0.5">
                <div className="flex justify-between text-[12px] tabular-nums">
                  <span>{i.name} ×{i.qty}</span><span>{rp(i.price * i.qty)}</span>
                </div>
                {i.note && <div className="text-[10px] text-[var(--color-primary)] opacity-80 italic">→ {i.note}</div>}
              </div>
            ))}
            <div className="flex justify-between text-[16px] font-extrabold text-[var(--color-primary)] mt-2 pt-2 border-t border-[var(--color-border)] tabular-nums">
              <span>TOTAL</span><span>{rp(settleModal.total)}</span>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-2">Metode Pembayaran *</label>
            <div className="grid grid-cols-3 gap-2 mb-1">
              {[{ id: 'Tunai', icon: '💵' }, { id: 'Transfer', icon: '🏦' }, { id: 'QRIS', icon: '📱' }].map(m => (
                <button key={m.id} type="button"
                  onClick={() => { setPaymentMethod(m.id); setPayMethodError(false) }}
                  className={`py-2 rounded-lg text-[12px] font-bold border-[1.5px] transition-all
                    ${paymentMethod === m.id
                      ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                      : `bg-[var(--color-surface2)] text-[var(--color-muted)] ${payMethodError ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'}`
                    }`}>
                  {m.icon} {m.id}
                </button>
              ))}
            </div>
            {payMethodError && <p className="text-[11px] text-[var(--color-danger)] mb-2 font-semibold">Pilih metode pembayaran</p>}
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
          <button onClick={() => { setSettleModal(null); setPaidAmount(''); setPaymentMethod(''); setPayMethodError(false) }}
            className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
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
          <button onClick={() => setReceiptOrder(null)} className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] mt-1.5 hover:text-[var(--color-text)] transition-colors">
            Tutup
          </button>
        </Modal>
      )}

      {/* New customer order alert */}
      {newOrderAlert && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] border-[1.5px] border-[var(--color-border)] rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🛎️</div>
              <h2 className="text-[18px] font-extrabold text-[var(--color-text)]">Pesanan Baru!</h2>
              <p className="text-[13px] text-[var(--color-primary)] font-bold mt-0.5">{newOrderAlert.customer_name}</p>
            </div>
            <div className="bg-[var(--color-surface2)] rounded-xl p-3 mb-4 border border-[var(--color-border)]">
              {newOrderAlert.order_items?.map(i => (
                <div key={i.id} className="py-0.5">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-[var(--color-text)]">{i.name} ×{i.qty}</span>
                    <span className="text-[var(--color-muted)] tabular-nums">{rp(i.price * i.qty)}</span>
                  </div>
                  {i.note && <div className="text-[10px] text-[var(--color-muted)] italic ml-2">→ {i.note}</div>}
                </div>
              ))}
              <div className="flex justify-between text-[14px] font-extrabold mt-2 pt-2 border-t border-[var(--color-border)] text-[var(--color-text)]">
                <span>Total</span><span className="tabular-nums text-[var(--color-primary)]">{rp(newOrderAlert.total)}</span>
              </div>
            </div>
            <button
              onClick={() => { setReceiptOrder(newOrderAlert); setNewOrderAlert(null) }}
              className="w-full py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-[13px] font-bold mb-2 hover:opacity-90 transition-opacity">
              🖨️ Print Pesanan
            </button>
            <button
              onClick={() => setNewOrderAlert(null)}
              className="w-full py-2.5 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[13px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
              Tutup
            </button>
          </div>
        </div>
      )}

      <div id="print-zone" className="hidden" />
    </div>
  )
}

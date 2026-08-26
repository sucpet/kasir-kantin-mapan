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

const STATUS_PRIORITY: Record<string, number> = { open: 0, paid: 1, done: 2 }

export default function PesananTab({ onToast, refreshKey, onOrderSettled }: PesananTabProps) {
  const [orders, setOrders] = useState<Order[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [doneCollapsed, setDoneCollapsed] = useState(true)
  const [settleModal, setSettleModal] = useState<Order | null>(null)
  const [paidAmount, setPaidAmount] = useState('')
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null)
  const [settleLoading, setSettleLoading] = useState(false)
  const [doneLoading, setDoneLoading] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [payMethodError, setPayMethodError] = useState(false)

  const fetchOrders = useCallback(async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })
    if (data) {
      const sorted = [...data].sort(
        (a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99)
      )
      setOrders(sorted)
    }
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders, refreshKey])

  useEffect(() => {
    const sub = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchOrders)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [fetchOrders])

  async function confirmSettle(order: Order) {
    if (!paymentMethod) { setPayMethodError(true); return }
    setSettleLoading(true)
    const paid = Number(paidAmount) || order.total
    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid', paid_amount: paid, paid_at: new Date().toISOString(), payment_method: paymentMethod })
      .eq('id', order.id)
    if (error) { onToast('Gagal memperbarui pesanan'); setSettleLoading(false); return }
    fetchOrders()
    setSettleModal(null)
    setExpanded(null)
    setPaidAmount('')
    setPaymentMethod('')
    setPayMethodError(false)
    setSettleLoading(false)
    onOrderSettled()
    setReceiptOrder({ ...order, status: 'paid', paid_amount: paid })
  }

  async function confirmSettleMandiri(order: Order) {
    setSettleLoading(true)
    const qrisAmount = order.total + order.points_to_earn
    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid', paid_amount: qrisAmount, paid_at: new Date().toISOString(), payment_method: 'QRIS' })
      .eq('id', order.id)
    if (error) { onToast('Gagal memperbarui pesanan'); setSettleLoading(false); return }
    fetchOrders()
    setSettleModal(null)
    setExpanded(null)
    setSettleLoading(false)
    onOrderSettled()
    const printedOrder = { ...order, status: 'paid' as const, paid_amount: qrisAmount, payment_method: 'QRIS' }
    doPrint(printedOrder)
    setReceiptOrder(printedOrder)
  }

  async function confirmDone(order: Order) {
    setDoneLoading(true)
    const { error } = await supabase
      .from('orders')
      .update({ status: 'done' })
      .eq('id', order.id)
    if (error) { onToast('Gagal memperbarui status'); setDoneLoading(false); return }
    fetchOrders()
    setExpanded(null)
    setDoneLoading(false)
    onToast('Pesanan selesai disajikan ✓')
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
    if (o.status === 'paid' || o.status === 'done') {
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

  const activeOrders = orders.filter(o => o.status !== 'done')
  const doneOrders   = orders.filter(o => o.status === 'done')
  const countOpen = orders.filter(o => o.status === 'open').length
  const countPaid = orders.filter(o => o.status === 'paid').length
  const countDone = doneOrders.length

  function renderCard(order: Order) {
    const isExp = expanded === order.id
    const isOpen = order.status === 'open'
    const isPaid = order.status === 'paid'
    const isDone = order.status === 'done'
    const isMandiri = order.source === 'customer'
    const itemCount = order.order_items?.reduce((s, i) => s + i.qty, 0) ?? 0

    let cardBg = 'bg-white border-[var(--color-border)]'
    if (isOpen && isMandiri) cardBg = 'bg-[var(--color-surface)] border-[var(--color-info)]'
    if (isPaid) cardBg = 'bg-[var(--color-info-light)] border-[var(--color-info)]'
    if (isDone) cardBg = 'bg-[var(--color-surface2)] border-[var(--color-border)]'

    return (
      <div key={order.id} className={`shrink-0 border-[1.5px] rounded-[10px] overflow-hidden shadow-[0_1px_2px_rgba(20,35,25,0.08)] ${cardBg}`}>
        <div
          className="flex items-center gap-3 px-3.5 py-3 cursor-pointer select-none hover:brightness-[0.97] transition-all"
          onClick={() => setExpanded(isExp ? null : order.id)}
        >
          <div className="flex-1">
            <div className={`text-[14px] font-bold ${isDone ? 'text-[var(--color-muted)]' : ''}`}>👤 {order.customer_name}</div>
            <div className="text-[11px] text-[var(--color-muted)] mt-0.5">
              {fmtTime(order.created_at)} · {itemCount} item
              {order.dining_type && ` · ${order.dining_type === 'dibungkus' ? '🥡 Bungkus' : '🍽️ Di Tempat'}`}
              {(isPaid || isDone) && order.payment_method && ` · ${order.payment_method}`}
            </div>
          </div>
          <div className="text-right">
            <div className={`text-[14px] font-extrabold tabular-nums ${isDone ? 'text-[var(--color-muted)]' : isPaid ? 'text-[var(--color-info)]' : 'text-[var(--color-primary)]'}`}>{rp(order.total)}</div>
            {isOpen && !isMandiri && <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent-text)]">Tab Terbuka</span>}
            {isOpen && isMandiri && <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-info-light)] text-[var(--color-info)]">📱 Order Mandiri</span>}
            {isPaid && <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-info-light)] text-[var(--color-info)]">🍳 Sedang Dimasak</span>}
            {isDone && <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-success-light)] text-[var(--color-success)]">✓ Selesai</span>}
          </div>
          <ChevronDown size={14} className={`text-[var(--color-muted)] transition-transform ${isExp ? 'rotate-180' : ''}`} />
        </div>

        {isExp && (
          <>
            <div className="border-t border-[var(--color-border-lt)] bg-[var(--color-surface2)] px-3.5 py-2.5">
              {order.order_items?.map(i => (
                <div key={i.id} className="flex justify-between text-[12px] py-0.5">
                  <span>
                    {i.name} ×{i.qty}
                    {i.note && <span className="text-[var(--color-muted)] italic"> · {i.note}</span>}
                  </span>
                  <span className="text-[var(--color-muted)] tabular-nums">{rp(i.price * i.qty)}</span>
                </div>
              ))}
              <div className="flex justify-between text-[13px] font-extrabold mt-2 pt-2 border-t border-[var(--color-border)]">
                <span>Total</span><span>{rp(order.total)}</span>
              </div>
              {(isPaid || isDone) && order.paid_amount != null && (
                <div className="flex justify-between text-[12px] text-[var(--color-muted)] mt-0.5">
                  <span>Dibayar</span><span className="tabular-nums">{rp(order.paid_amount)}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 px-3.5 py-2 border-t border-[var(--color-border-lt)]">
              {isOpen && !isMandiri && (
                <button onClick={() => { setSettleModal(order); setPaidAmount(''); setPaymentMethod(order.payment_method ?? ''); setPayMethodError(false) }}
                  className="flex-1 py-1.5 text-[12px] font-bold text-white bg-[var(--color-success)] rounded-lg hover:bg-[#1f6440] transition-colors">
                  💳 Bayar
                </button>
              )}
              {isOpen && isMandiri && (
                <button onClick={() => setSettleModal(order)}
                  className="flex-1 py-1.5 text-[12px] font-bold text-white bg-[var(--color-info)] rounded-lg hover:opacity-90 transition-opacity">
                  ✅ Konfirmasi Pembayaran
                </button>
              )}
              {isPaid && (
                <button onClick={() => confirmDone(order)} disabled={doneLoading}
                  className="flex-1 py-1.5 text-[12px] font-bold text-white bg-[var(--color-info)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
                  ✅ Selesai Disajikan
                </button>
              )}
              <button onClick={() => setReceiptOrder(order)}
                className={`py-1.5 text-[12px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] rounded-lg hover:text-[var(--color-text)] transition-colors ${(isPaid || isDone || (isOpen && isMandiri)) ? 'flex-1' : 'px-3'}`}>
                🖨️ Print
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="bg-white border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <span className="text-[14px] font-extrabold">Pesanan Hari Ini</span>
        <span className="text-[12px] text-[var(--color-muted)]">
          {countOpen > 0 && `${countOpen} terbuka`}
          {countOpen > 0 && countPaid > 0 && ' · '}
          {countPaid > 0 && `${countPaid} dimasak`}
          {(countOpen > 0 || countPaid > 0) && countDone > 0 && ' · '}
          {countDone > 0 && `${countDone} selesai`}
          {countOpen === 0 && countPaid === 0 && countDone === 0 && 'kosong'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-[var(--color-muted)]">
            <span className="text-4xl">✅</span>
            <span className="text-[13px] font-bold text-[var(--color-text)]">Belum ada pesanan hari ini</span>
          </div>
        )}

        {activeOrders.map(renderCard)}

        {countDone > 0 && (
          <div className="shrink-0 mt-1">
            <button
              onClick={() => setDoneCollapsed(c => !c)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-[10px] bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors select-none">
              <span className="text-[12px] font-bold">✓ Pesanan Selesai ({countDone})</span>
              <ChevronDown size={14} className={`transition-transform ${doneCollapsed ? '' : 'rotate-180'}`} />
            </button>
            {!doneCollapsed && (
              <div className="flex flex-col gap-2 mt-2">
                {doneOrders.map(renderCard)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settle modal — mandiri (QRIS simplified) */}
      {settleModal && settleModal.source === 'customer' && (
        <Modal onClose={() => setSettleModal(null)}>
          <h2 className="text-[16px] font-extrabold text-center mb-1">✅ Konfirmasi Pembayaran</h2>
          <p className="text-center text-[13px] font-bold text-[var(--color-primary)] mb-4">{settleModal.customer_name}</p>
          <div className="bg-[var(--color-primary-light)] rounded-[10px] p-3.5 mb-3">
            {settleModal.order_items?.map(i => (
              <div key={i.id} className="py-0.5">
                <div className="flex justify-between text-[12px] tabular-nums">
                  <span>{i.name} ×{i.qty}</span><span>{rp(i.price * i.qty)}</span>
                </div>
                {i.note && <div className="text-[10px] text-[var(--color-primary)] opacity-80 italic">→ {i.note}</div>}
              </div>
            ))}
            <div className="flex justify-between text-[13px] text-[var(--color-muted)] mt-2 pt-2 border-t border-[var(--color-border)] tabular-nums">
              <span>Subtotal</span><span>{rp(settleModal.total)}</span>
            </div>
            {settleModal.pending_redeem > 0 && (
              <div className="flex justify-between text-[13px] text-[var(--color-muted)] mt-0.5 tabular-nums">
                <span>Poin digunakan</span><span>−{rp(settleModal.pending_redeem)}</span>
              </div>
            )}
          </div>
          <div className="bg-[var(--color-info-light)] border border-[var(--color-info)] rounded-[10px] p-3.5 mb-3">
            <div className="flex justify-between items-center">
              <span className="text-[13px] font-bold text-[var(--color-info)]">📱 Nominal QRIS</span>
              <span className="text-[18px] font-extrabold tabular-nums text-[var(--color-info)]">{rp(settleModal.total + settleModal.points_to_earn)}</span>
            </div>
            <p className="text-[11px] text-[var(--color-muted)] mt-1.5">Pastikan jumlah ini sudah masuk di histori QRIS sebelum konfirmasi.</p>
          </div>
          <button onClick={() => confirmSettleMandiri(settleModal)} disabled={settleLoading}
            className="w-full py-2.5 rounded-lg text-[13px] font-bold text-white bg-[var(--color-info)] mb-1.5 disabled:opacity-50 hover:opacity-90 transition-opacity">
            {settleLoading ? 'Memproses...' : '✅ Konfirmasi Sudah Dibayar'}
          </button>
          <button onClick={() => setSettleModal(null)}
            className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
            Batal
          </button>
        </Modal>
      )}

      {/* Settle modal — kasir (full) */}
      {settleModal && settleModal.source !== 'customer' && (
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
          <button onClick={() => confirmSettle(settleModal)} disabled={settleLoading}
            className="w-full py-2.5 rounded-lg text-[13px] font-bold text-white bg-[var(--color-success)] mb-1.5 disabled:opacity-50 hover:bg-[#1f6440] transition-colors">
            {settleLoading ? 'Memproses...' : '✅ Konfirmasi Bayar'}
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

      <div id="print-zone" className="hidden" />
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Order } from '@/lib/types'
import { rp, fmtTime, inQueue, isServed, qrisAmount } from '@/lib/utils'
import { isConnected, printReceipt } from '@/lib/printer'
import Modal from '@/components/Modal'
import PayModal from '@/components/PayModal'

interface PesananTabProps {
  onToast: (msg: string) => void
  refreshKey: number
  onOrderSettled: () => void
}

const bigBtn = 'flex-1 px-2 py-3.5 rounded-xl text-white text-[length:calc(15px*var(--fs))] font-extrabold disabled:opacity-50 active:scale-[0.98] transition-transform'

const orderLabel = (o: Order) =>
  `#${o.queue_no ?? '–'}${o.customer_name && o.customer_name !== 'Tamu' ? ` · ${o.customer_name}` : ''}`

export default function PesananTab({ onToast, refreshKey, onOrderSettled }: PesananTabProps) {
  const [orders, setOrders] = useState<Order[]>([])
  const [doneCollapsed, setDoneCollapsed] = useState(true)
  const printOnOpen = useRef(false)
  const [payOrder, setPayOrder] = useState<Order | null>(null)
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null)
  const [servingId, setServingId] = useState<string | null>(null)
  const [checkOrder, setCheckOrder] = useState<Order | null>(null)
  const [checking, setChecking] = useState(false)

  const fetchOrders = useCallback(async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .or(`created_at.gte.${todayStart.toISOString()},status.eq.open,and(status.eq.paid,served_at.is.null)`)
      .order('created_at', { ascending: true })
    if (data) setOrders(data)
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders, refreshKey])

  useEffect(() => {
    if (receiptOrder && printOnOpen.current) {
      printOnOpen.current = false
      if (localStorage.getItem('auto_print') !== 'true') return
      const text = buildReceipt(receiptOrder)
      if (isConnected()) {
        printReceipt(text)
          .then(() => onToast('🖨️ Struk berhasil dikirim ke printer'))
          .catch(() => onToast('Gagal print ke printer Bluetooth'))
      } else {
        const t = setTimeout(() => doPrint(receiptOrder), 150)
        return () => clearTimeout(t)
      }
    }
  }, [receiptOrder])

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

  async function markServed(order: Order) {
    setServingId(order.id)
    const { error } = await supabase
      .from('orders')
      .update({ served_at: new Date().toISOString() })
      .eq('id', order.id)
      .is('served_at', null)
    setServingId(null)
    if (error) { onToast('Gagal menyimpan. Coba lagi.'); return }
    onToast(`${orderLabel(order)} sudah disajikan ✓`)
    fetchOrders()
    onOrderSettled()
  }

  async function confirmQris(order: Order) {
    setChecking(true)
    const paidAmount = qrisAmount(order)
    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid', paid_amount: paidAmount, paid_at: new Date().toISOString(), payment_method: 'QRIS', payment_issue_at: null })
      .eq('id', order.id)
      .eq('status', 'open')
    setChecking(false)
    if (error) { onToast('Gagal menyimpan. Coba lagi.'); return }
    setCheckOrder(null)
    handlePaid({ ...order, status: 'paid', paid_amount: paidAmount, payment_method: 'QRIS', payment_issue_at: null })
  }

  async function flagNotReceived(order: Order) {
    setChecking(true)
    const { error } = await supabase
      .from('orders')
      .update({ payment_issue_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('status', 'open')
    setChecking(false)
    if (error) { onToast('Gagal menyimpan. Coba lagi.'); return }
    setCheckOrder(null)
    onToast(`${orderLabel(order)}: pelanggan diberi tahu pembayaran belum diterima`)
    fetchOrders()
  }

  function handlePaid(paid: Order) {
    setPayOrder(null)
    onToast(`${orderLabel(paid)} lunas ✓`)
    fetchOrders()
    onOrderSettled()
    printOnOpen.current = true
    setReceiptOrder(paid)
  }

  function buildReceipt(o: Order): string {
    const line = '--------------------------------'
    const jenis = o.dining_type === 'dibungkus' ? 'Dibungkus' : o.dining_type === 'makan_ditempat' ? 'Di Tempat' : '-'
    let r = `KASIR KANTIN\n${line}\nAntrian   : ${orderLabel(o)}\nWaktu     : ${fmtTime(o.created_at)}\nJenis     : ${jenis}\n${line}\n`
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

  async function doPrint(o: Order) {
    const text = buildReceipt(o)
    if (isConnected()) {
      try {
        await printReceipt(text)
        onToast('🖨️ Struk berhasil dikirim ke printer')
      } catch { onToast('Gagal print ke printer Bluetooth') }
    } else {
      const pz = document.getElementById('print-zone')
      if (pz) pz.textContent = text
      window.print()
    }
  }

  const queue = orders.filter(inQueue)
  const finished = orders.filter(o => !inQueue(o)).reverse()

  function renderQueueCard(order: Order) {
    const served = isServed(order)
    const paid = order.status !== 'open'
    const items = order.order_items ?? []
    const isMandiri = order.source === 'customer'
    return (
      <div key={order.id} className="border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] rounded-2xl overflow-hidden flex flex-col">
        <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[length:calc(22px*var(--fs))] font-extrabold leading-tight truncate">{orderLabel(order)}</div>
            <div className="text-[length:calc(12px*var(--fs))] text-[var(--color-muted)]">
              {fmtTime(order.created_at)}{order.source === 'customer' && ' · 📱 Pesan sendiri'}
            </div>
          </div>
          {order.dining_type && (
            <span className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-[length:calc(14px*var(--fs))] font-extrabold whitespace-nowrap
              ${order.dining_type === 'dibungkus' ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'}`}>
              {order.dining_type === 'dibungkus' ? '🥡 Bungkus' : '🍽️ Makan di Tempat'}
            </span>
          )}
        </div>

        <div className="px-4 py-2 border-y border-[var(--color-border-lt)] bg-[var(--color-surface2)] flex-1">
          {items.map(i => (
            <div key={i.id} className="py-1">
              <div className="flex gap-3 text-[length:calc(16px*var(--fs))] font-bold leading-snug">
                <span className="tabular-nums text-[var(--color-primary)] flex-shrink-0 min-w-[calc(28px*var(--fs))]">{i.qty}×</span>
                <span>{i.name}</span>
              </div>
              {i.note && (
                <div className="ml-[calc(28px*var(--fs)_+_0.75rem)] text-[length:calc(14px*var(--fs))] font-semibold text-[var(--color-accent)]">→ {i.note}</div>
              )}
            </div>
          ))}
        </div>

        <div className="px-4 py-2 flex flex-wrap gap-2 text-[length:calc(13px*var(--fs))] font-bold">
          {isMandiri && !paid ? (
            order.payment_issue_at
              ? <span className="text-[var(--color-danger)]">⚠️ Pembayaran belum diterima</span>
              : <span className="text-[var(--color-accent)]">⏳ Cek pembayaran QRIS {rp(qrisAmount(order))}</span>
          ) : (
            <>
              <span className={served ? 'text-[var(--color-success)]' : 'text-[var(--color-info)]'}>
                {served ? '✅ Sudah disajikan' : '🍳 Sedang disiapkan'}
              </span>
              <span className="text-[var(--color-muted)]">·</span>
              <span className={paid ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}>
                {paid ? `💚 Lunas${order.payment_method ? ` (${order.payment_method})` : ''}` : `Belum bayar ${rp(order.total)}`}
              </span>
            </>
          )}
        </div>

        <div className="px-3 pb-3 flex gap-2">
          {isMandiri ? (
            !paid ? (
              <button onClick={() => setCheckOrder(order)} className={`${bigBtn} bg-[var(--color-info)]`}>
                🔍 Cek Pembayaran
              </button>
            ) : !served && (
              <button onClick={() => markServed(order)} disabled={servingId === order.id} className={`${bigBtn} bg-[var(--color-success)]`}>
                ✓ Sudah Selesai
              </button>
            )
          ) : (
            <>
              {!served && (
                <button onClick={() => markServed(order)} disabled={servingId === order.id} className={`${bigBtn} bg-[var(--color-success)]`}>
                  ✓ Sudah Disajikan
                </button>
              )}
              {!paid && (
                <button onClick={() => setPayOrder(order)} className={`${bigBtn} bg-[var(--color-info)]`}>
                  💰 Bayar Pesanan
                </button>
              )}
            </>
          )}
          <button onClick={() => setReceiptOrder(order)} title="Struk"
            className="px-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[length:calc(15px*var(--fs))]">
            🖨️
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="bg-white border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <span className="text-[length:calc(16px*var(--fs))] font-extrabold">📋 Antrian ({queue.length})</span>
        <span className="text-[length:calc(12px*var(--fs))] text-[var(--color-muted)]">Pesanan lama di atas</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {queue.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-[var(--color-muted)]">
            <span className="text-5xl">✅</span>
            <span className="text-[length:calc(15px*var(--fs))] font-bold text-[var(--color-text)]">Tidak ada pesanan yang menunggu</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {queue.map(renderQueueCard)}
        </div>

        {finished.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setDoneCollapsed(c => !c)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)]">
              <span className="text-[length:calc(13px*var(--fs))] font-bold">✓ Selesai hari ini ({finished.length})</span>
              <ChevronDown size={14} className={`size-[calc(14px*var(--fs))] transition-transform ${doneCollapsed ? '' : 'rotate-180'}`} />
            </button>
            {!doneCollapsed && (
              <div className="flex flex-col gap-1.5 mt-2">
                {finished.map(o => (
                  <button key={o.id} onClick={() => setReceiptOrder(o)}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-left">
                    <span className="min-w-0 truncate text-[length:calc(13px*var(--fs))] font-bold">
                      {orderLabel(o)} <span className="font-normal text-[var(--color-muted)]">· {fmtTime(o.created_at)} · {(o.order_items ?? []).reduce((s, i) => s + i.qty, 0)} item</span>
                    </span>
                    <span className="flex-shrink-0 text-[length:calc(13px*var(--fs))] font-extrabold tabular-nums text-[var(--color-muted)]">{rp(o.total)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {payOrder && (
        <PayModal order={payOrder} onClose={() => setPayOrder(null)} onPaid={handlePaid} onToast={onToast} />
      )}

      {checkOrder && (
        <Modal onClose={() => setCheckOrder(null)}>
          <h2 className="text-[length:calc(18px*var(--fs))] font-extrabold text-center">🔍 Cek Pembayaran QRIS</h2>
          <p className="text-center text-[length:calc(14px*var(--fs))] font-bold text-[var(--color-muted)] mb-3">{orderLabel(checkOrder)}</p>
          <div className="bg-[var(--color-info-light)] border border-[var(--color-info)] rounded-xl p-4 mb-3 text-center">
            <div className="text-[length:calc(13px*var(--fs))] font-bold text-[var(--color-info)]">Cari nominal ini di histori QRIS</div>
            <div className="text-[length:calc(28px*var(--fs))] font-extrabold tabular-nums text-[var(--color-info)]">{rp(qrisAmount(checkOrder))}</div>
          </div>
          {checkOrder.pending_redeem > 0 && (
            <p className="text-[length:calc(12px*var(--fs))] text-[var(--color-muted)] text-center mb-3">Termasuk potongan poin {rp(checkOrder.pending_redeem)}</p>
          )}
          <button onClick={() => confirmQris(checkOrder)} disabled={checking}
            className="w-full py-4 rounded-xl bg-[var(--color-success)] text-white text-[length:calc(16px*var(--fs))] font-extrabold mb-2 disabled:opacity-50">
            ✓ Sudah Masuk
          </button>
          <button onClick={() => flagNotReceived(checkOrder)} disabled={checking}
            className="w-full py-4 rounded-xl bg-[var(--color-danger)] text-white text-[length:calc(16px*var(--fs))] font-extrabold mb-2 disabled:opacity-50">
            ✗ Belum Masuk — Beri Tahu Pelanggan
          </button>
          <button onClick={() => setCheckOrder(null)}
            className="w-full py-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[length:calc(14px*var(--fs))] font-semibold text-[var(--color-muted)]">
            Tutup
          </button>
        </Modal>
      )}

      {receiptOrder && (
        <Modal onClose={() => setReceiptOrder(null)}>
          <h2 className="text-[length:calc(16px*var(--fs))] font-extrabold text-center mb-4">🧾 Struk Pesanan</h2>
          <pre className="font-mono text-[length:calc(11px*var(--fs))] leading-relaxed bg-[var(--color-surface2)] border border-dashed border-[var(--color-border)] rounded-lg p-3 overflow-x-auto whitespace-pre">
            {buildReceipt(receiptOrder)}
          </pre>
          <button onClick={() => doPrint(receiptOrder)} className="w-full py-3 rounded-xl text-[length:calc(14px*var(--fs))] font-bold bg-[var(--color-primary)] text-white mt-3">
            🖨️ Print
          </button>
          <button onClick={() => setReceiptOrder(null)} className="w-full py-3 rounded-xl text-[length:calc(14px*var(--fs))] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] mt-1.5">
            Tutup
          </button>
        </Modal>
      )}

      <div id="print-zone" className="hidden" />
    </div>
  )
}

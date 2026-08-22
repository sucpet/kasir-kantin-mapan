'use client'
import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Order } from '@/lib/types'
import { rp, fmtTime, fmtDate, todayStr, shiftDate, dateKey } from '@/lib/utils'
import Modal from '@/components/Modal'

export default function RekapTab() {
  const [date, setDate] = useState(todayStr())
  const [orders, setOrders] = useState<Order[]>([])
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const start = new Date(date + 'T00:00:00').toISOString()
    const end = new Date(date + 'T23:59:59').toISOString()
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })
    if (data) setOrders(data)
    setLoading(false)
  }, [date])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const paid = orders.filter(o => o.status === 'paid')
  const open = orders.filter(o => o.status === 'open')
  const revenue = paid.reduce((s, o) => s + o.total, 0)

  const itemMap: Record<string, { qty: number; total: number }> = {}
  paid.forEach(o => o.order_items?.forEach(i => {
    if (!itemMap[i.name]) itemMap[i.name] = { qty: 0, total: 0 }
    itemMap[i.name].qty += i.qty
    itemMap[i.name].total += i.price * i.qty
  }))
  const itemRows = Object.entries(itemMap).sort((a, b) => b[1].total - a[1].total)

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
    const pz = document.getElementById('print-zone-rekap')
    if (pz) pz.textContent = buildReceipt(o)
    window.print()
  }

  const isToday = date === todayStr()

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Date navigator */}
      <div className="bg-white border-b border-[var(--color-border)] px-4 pt-3 pb-3 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setDate(shiftDate(date, -1))}
            className="w-[30px] h-[30px] rounded-lg border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface2)] flex items-center justify-center text-[var(--color-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-all">
            <ChevronLeft size={14} />
          </button>
          <div className="flex-1 text-center text-[14px] font-bold">{fmtDate(date)}</div>
          <button onClick={() => !isToday && setDate(shiftDate(date, 1))}
            disabled={isToday}
            className="w-[30px] h-[30px] rounded-lg border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface2)] flex items-center justify-center text-[var(--color-muted)] disabled:opacity-30 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-all disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-muted)]">
            <ChevronRight size={14} />
          </button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-2 py-1 border-[1.5px] border-[var(--color-border)] rounded-lg text-[12px] outline-none focus:border-[var(--color-primary)] bg-[var(--color-surface2)]" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[var(--color-primary-light)] rounded-[10px] p-2.5 text-center">
            <div className="text-[13px] font-extrabold text-[var(--color-primary)] tabular-nums leading-tight">{rp(revenue)}</div>
            <div className="text-[10px] text-[var(--color-muted)] mt-0.5 font-semibold uppercase tracking-wide">Pemasukan</div>
          </div>
          <div className="bg-[var(--color-primary-light)] rounded-[10px] p-2.5 text-center">
            <div className="text-[13px] font-extrabold text-[var(--color-primary)] leading-tight">{paid.length}</div>
            <div className="text-[10px] text-[var(--color-muted)] mt-0.5 font-semibold uppercase tracking-wide">Transaksi</div>
          </div>
          <div className="bg-[var(--color-accent-light)] rounded-[10px] p-2.5 text-center">
            <div className="text-[13px] font-extrabold text-[var(--color-accent)] leading-tight">{open.length}</div>
            <div className="text-[10px] text-[var(--color-muted)] mt-0.5 font-semibold uppercase tracking-wide">Tab Terbuka</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="text-center py-8 text-[var(--color-muted)] text-[13px]">Memuat...</div>
        )}

        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-[var(--color-muted)]">
            <span className="text-4xl">📊</span>
            <span className="text-[13px] font-bold text-[var(--color-text)]">Belum ada transaksi</span>
            <span className="text-xs">Tidak ada data untuk {fmtDate(date).split(' — ')[0]}</span>
          </div>
        )}

        {!loading && itemRows.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-muted)] mb-2 px-0.5">Menu Terjual</div>
            {itemRows.map(([name, d]) => (
              <div key={name} className="bg-white border border-[var(--color-border)] rounded-lg px-3 py-2 flex items-center gap-2.5 mb-1">
                <span className="flex-1 text-[12px] font-semibold">{name}</span>
                <span className="text-[11px] text-[var(--color-muted)] tabular-nums">{d.qty}×</span>
                <span className="text-[12px] font-extrabold text-[var(--color-primary)] tabular-nums">{rp(d.total)}</span>
              </div>
            ))}
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-muted)] mb-2 px-0.5">Transaksi</div>
            {orders.map(o => (
              <div key={o.id}
                className="bg-white border border-[var(--color-border)] rounded-lg px-3 py-2.5 flex items-center gap-2.5 mb-1 cursor-pointer hover:bg-[var(--color-surface2)] transition-colors"
                onClick={() => setReceiptOrder(o)}>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{o.customer_name}</div>
                  <div className="text-[11px] text-[var(--color-muted)] tabular-nums">{fmtTime(o.created_at)} · {o.order_items?.reduce((s, i) => s + i.qty, 0)} item</div>
                </div>
                <div className="text-right">
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-0.5 ${o.status === 'paid' ? 'bg-[var(--color-success-light)] text-[var(--color-success-text)]' : 'bg-[var(--color-accent-light)] text-[var(--color-accent-text)]'}`}>
                    {o.status === 'paid' ? 'Lunas' : 'Tab'}
                  </span>
                  <div className={`text-[13px] font-extrabold tabular-nums ${o.status === 'paid' ? 'text-[var(--color-success)]' : 'text-[var(--color-accent)]'}`}>
                    {rp(o.total)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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

      <div id="print-zone-rekap" className="hidden" />
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { Minus, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { MenuItem, CartItem, Order } from '@/lib/types'
import { rp, orderSum } from '@/lib/utils'
import Modal from '@/components/Modal'

interface KasirTabProps {
  onToast: (msg: string) => void
  onOrderCreated: () => void
}

export default function KasirTab({ onToast, onOrderCreated }: KasirTabProps) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [activeCat, setActiveCat] = useState('Semua')
  const [cart, setCart] = useState<CartItem[]>([])
  const [customerName, setCustomerName] = useState('')
  const [payModal, setPayModal] = useState<'bayar' | 'tab' | null>(null)
  const [paidAmount, setPaidAmount] = useState('')
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [optionItem, setOptionItem] = useState<MenuItem | null>(null)
  const [pendingOpts, setPendingOpts] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchMenu()
  }, [])

  async function fetchMenu() {
    const { data } = await supabase
      .from('menu_items')
      .select('*')
      .order('category')
      .order('name')
    if (data) {
      setMenuItems(data)
      const cats = [...new Set(data.map((i: MenuItem) => i.category))]
      setCategories(cats)
    }
  }

  const filtered = activeCat === 'Semua'
    ? menuItems
    : menuItems.filter(i => i.category === activeCat)

  function addToCart(item: MenuItem) {
    if (!item.available) return
    const opts = item.options ?? []
    if (opts.length > 0) {
      setPendingOpts({})
      setOptionItem(item)
    } else {
      doAddToCart(item, {})
    }
  }

  function doAddToCart(item: MenuItem, opts: Record<string, string>) {
    const variantStr = Object.values(opts).filter(Boolean).join(', ')
    const displayName = variantStr ? `${item.name} (${variantStr})` : item.name
    const cartKey = variantStr ? `${item.id}::${variantStr}` : item.id

    setCart(prev => {
      const ex = prev.find(c => c.cartKey === cartKey)
      if (ex) return prev.map(c => c.cartKey === cartKey ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { menuId: item.id, cartKey, name: displayName, price: item.price, qty: 1 }]
    })
  }

  function adjustQty(cartKey: string, delta: number) {
    setCart(prev => {
      const updated = prev.map(c => c.cartKey === cartKey ? { ...c, qty: c.qty + delta } : c)
      return updated.filter(c => c.qty > 0)
    })
  }

  function clearCart() {
    setCart([])
    setCustomerName('')
  }

  const total = orderSum(cart)
  const change = paidAmount ? Math.max(0, Number(paidAmount) - total) : 0

  async function confirmPay(mode: 'bayar' | 'tab') {
    if (!cart.length) return
    setLoading(true)
    const cust = customerName.trim() || 'Tamu'

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        customer_name: cust,
        status: mode === 'tab' ? 'open' : 'paid',
        total,
        paid_amount: mode === 'bayar' ? (Number(paidAmount) || total) : null,
        paid_at: mode === 'bayar' ? new Date().toISOString() : null,
      })
      .select()
      .single()

    if (error || !order) { onToast('Gagal menyimpan pesanan'); setLoading(false); return }

    await supabase.from('order_items').insert(
      cart.map(c => ({
        order_id: order.id,
        menu_item_id: c.menuId,
        name: c.name,
        price: c.price,
        qty: c.qty,
      }))
    )

    clearCart()
    setPayModal(null)
    setPaidAmount('')
    setLoading(false)
    onOrderCreated()

    if (mode === 'tab') {
      onToast(`Tab "${cust}" dibuat!`)
    } else {
      setReceiptOrder({ ...order, order_items: cart.map(c => ({ id: '', order_id: order.id, menu_item_id: c.menuId, name: c.name, price: c.price, qty: c.qty })) })
    }
  }

  function buildReceipt(o: Order): string {
    const line = '--------------------------------'
    let r = `KASIR KANTIN\n${line}\nPelanggan : ${o.customer_name}\n${line}\n`
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

  function doPrint() {
    if (!receiptOrder) return
    const pz = document.getElementById('print-zone')
    if (pz) pz.textContent = buildReceipt(receiptOrder)
    window.print()
  }

  const allOptsSelected = optionItem
    ? (optionItem.options ?? []).every(g => pendingOpts[g.name])
    : false

  return (
    <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
      {/* Menu panel */}
      <div className="flex-1 flex flex-col overflow-hidden border-b sm:border-b-0 sm:border-r border-[var(--color-border)]">
        {/* Category bar */}
        <div className="flex gap-2 px-3 py-2 bg-white border-b border-[var(--color-border)] overflow-x-auto scrollbar-hide flex-shrink-0">
          {['Semua', ...categories].map(c => (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap flex-shrink-0 border-[1.5px] transition-all
                ${activeCat === c
                  ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                  : 'bg-white border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Menu grid */}
        <div className="flex-1 overflow-y-auto p-2.5 grid grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 content-start">
          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-[var(--color-muted)]">
              <span className="text-4xl mb-2">🍽️</span>
              <p className="text-sm font-semibold text-[#1C2420]">Belum ada menu</p>
              <p className="text-xs">Tambah di tab Menu</p>
            </div>
          )}
          {filtered.map(item => (
            <button
              key={item.id}
              onClick={() => addToCart(item)}
              disabled={!item.available}
              className={`bg-white border-[1.5px] border-[var(--color-border)] rounded-[10px] p-3 text-left flex flex-col gap-1
                transition-all shadow-[0_1px_2px_rgba(20,35,25,0.08)]
                ${item.available
                  ? 'cursor-pointer hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] hover:-translate-y-px hover:shadow-md active:scale-95'
                  : 'opacity-40 cursor-not-allowed'
                }`}
            >
              <span className="text-[12px] font-bold leading-tight">{item.name}</span>
              <span className="text-[12px] font-extrabold text-[var(--color-primary)] tabular-nums">{rp(item.price)}</span>
              <span className="text-[10px] text-[var(--color-muted)]">{item.category}</span>
              {(item.options ?? []).length > 0 && (
                <span className="text-[9px] text-[var(--color-primary)] font-semibold opacity-70">▾ ada pilihan</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Order panel */}
      <div className="w-full sm:w-[290px] flex-shrink-0 bg-white flex flex-col max-h-[42vh] sm:max-h-none">
        <div className="px-3.5 py-3 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-muted)]">Pesanan</span>
            <button onClick={clearCart} className="text-[11px] font-semibold text-[var(--color-muted)] bg-[var(--color-surface2)] border border-[var(--color-border)] px-2 py-1 rounded-md hover:text-[#1C2420] transition-colors">
              Bersihkan
            </button>
          </div>
          <input
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Nama / meja pelanggan (opsional)"
            className="w-full px-3 py-1.5 text-[12px] border-[1.5px] border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-primary)] placeholder:text-[var(--color-muted)]"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3.5">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--color-muted)] py-6">
              <span className="text-4xl opacity-40">🛒</span>
              <span className="text-[12px]">Ketuk item menu untuk menambahkan</span>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.cartKey} className="flex items-start gap-2 py-2.5 border-b border-[var(--color-border-lt)]">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold leading-tight">{item.name}</div>
                  <div className="text-[11px] text-[var(--color-muted)] tabular-nums mt-0.5">
                    {rp(item.price)} × {item.qty} = {rp(item.price * item.qty)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => adjustQty(item.cartKey, -1)} className="w-[22px] h-[22px] rounded-full border-[1.5px] border-[var(--color-danger-light)] text-[var(--color-danger)] flex items-center justify-center hover:bg-[var(--color-danger-light)] transition-colors">
                    <Minus size={10} strokeWidth={3} />
                  </button>
                  <span className="text-[13px] font-extrabold min-w-[18px] text-center tabular-nums">{item.qty}</span>
                  <button onClick={() => adjustQty(item.cartKey, 1)} className="w-[22px] h-[22px] rounded-full border-[1.5px] border-[var(--color-success-light)] text-[var(--color-success)] flex items-center justify-center hover:bg-[var(--color-success-light)] transition-colors">
                    <Plus size={10} strokeWidth={3} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-3.5 py-3 border-t border-[var(--color-border)] flex-shrink-0">
          <div className="flex justify-between items-baseline mb-2.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-muted)]">Total</span>
            <span className="text-[20px] font-extrabold tabular-nums">{rp(total)}</span>
          </div>
          <button onClick={() => setPayModal('bayar')} disabled={!cart.length} className="w-full py-2.5 rounded-[8px] bg-[var(--color-success)] text-white text-[13px] font-bold mb-1.5 disabled:opacity-40 hover:bg-[#1f6440] transition-colors">
            ✅ Bayar Sekarang
          </button>
          <button onClick={() => setPayModal('tab')} disabled={!cart.length} className="w-full py-2.5 rounded-[8px] border-[1.5px] border-[var(--color-primary)] text-[var(--color-primary)] text-[13px] font-bold disabled:opacity-40 hover:bg-[var(--color-primary-light)] transition-colors">
            📌 Simpan Tab
          </button>
        </div>
      </div>

      {/* Option selection modal */}
      {optionItem && (
        <Modal onClose={() => setOptionItem(null)}>
          <h2 className="text-[16px] font-extrabold text-center mb-1">{optionItem.name}</h2>
          <p className="text-center text-[12px] text-[var(--color-muted)] mb-4">{rp(optionItem.price)}</p>
          {(optionItem.options ?? []).map((group, gi) => (
            <div key={gi} className="mb-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-2">
                {group.name} *
              </label>
              <div className="flex flex-wrap gap-2">
                {group.choices.map(choice => (
                  <button
                    key={choice}
                    onClick={() => setPendingOpts(prev => ({ ...prev, [group.name]: choice }))}
                    className={`px-3.5 py-2 rounded-lg text-[13px] font-semibold border-[1.5px] transition-all
                      ${pendingOpts[group.name] === choice
                        ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                        : 'bg-white border-[var(--color-border)] text-[#1C2420] hover:border-[var(--color-primary)]'
                      }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={() => { doAddToCart(optionItem, pendingOpts); setOptionItem(null) }}
            disabled={!allOptsSelected}
            className="w-full py-2.5 rounded-lg text-[13px] font-bold bg-[var(--color-primary)] text-white mb-1.5 disabled:opacity-40 hover:bg-[var(--color-primary-mid)] transition-colors"
          >
            ➕ Tambah ke Pesanan
          </button>
          <button onClick={() => setOptionItem(null)} className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[#1C2420] transition-colors">
            Batal
          </button>
        </Modal>
      )}

      {/* Payment modal */}
      {payModal && (
        <Modal onClose={() => { setPayModal(null); setPaidAmount('') }}>
          <h2 className="text-[16px] font-extrabold text-center mb-4">
            {payModal === 'tab' ? '📌 Simpan Tab' : '💳 Pembayaran'}
          </h2>
          <div className="bg-[var(--color-primary-light)] rounded-[10px] p-3.5 mb-4">
            {cart.map(i => (
              <div key={i.cartKey} className="flex justify-between text-[12px] py-0.5 tabular-nums">
                <span>{i.name} ×{i.qty}</span><span>{rp(i.price * i.qty)}</span>
              </div>
            ))}
            <div className="flex justify-between text-[16px] font-extrabold text-[var(--color-primary)] mt-2 pt-2 border-t border-[#afd0bc] tabular-nums">
              <span>TOTAL</span><span>{rp(total)}</span>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1">Nama / Meja Pelanggan</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Tamu"
              className="w-full px-3 py-2 border-[1.5px] border-[var(--color-border)] rounded-lg text-[13px] outline-none focus:border-[var(--color-primary)]" />
          </div>

          {payModal === 'bayar' && (
            <div className="mb-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1">Uang Diterima</label>
              <input
                type="number" inputMode="numeric"
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value)}
                placeholder={String(total)}
                className="w-full px-3 py-2 border-[1.5px] border-[var(--color-border)] rounded-lg text-[13px] outline-none focus:border-[var(--color-primary)]"
              />
              {paidAmount && (
                <div className={`flex justify-between text-[14px] font-extrabold mt-2 pt-2 border-t border-[var(--color-border)] tabular-nums ${change >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                  <span>Kembalian</span>
                  <span>{rp(change)}</span>
                </div>
              )}
            </div>
          )}

          {payModal === 'tab' && (
            <p className="text-[12px] text-[var(--color-muted)] mb-3">Pesanan akan disimpan sebagai tab terbuka. Bayar nanti dari tab Pesanan.</p>
          )}

          <button
            onClick={() => confirmPay(payModal)}
            disabled={loading}
            className={`w-full py-2.5 rounded-lg text-[13px] font-bold text-white mb-1.5 disabled:opacity-50 transition-colors
              ${payModal === 'bayar' ? 'bg-[var(--color-success)] hover:bg-[#1f6440]' : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-mid)]'}`}
          >
            {loading ? 'Menyimpan...' : payModal === 'tab' ? '📌 Simpan Tab' : '✅ Konfirmasi Bayar'}
          </button>
          <button onClick={() => { setPayModal(null); setPaidAmount('') }} className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[#1C2420] transition-colors">
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
          <button onClick={doPrint} className="w-full py-2.5 rounded-lg text-[13px] font-bold bg-[var(--color-primary)] text-white mt-3 hover:bg-[var(--color-primary-mid)] transition-colors">
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

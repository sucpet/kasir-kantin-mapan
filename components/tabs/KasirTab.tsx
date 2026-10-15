'use client'
import { useState, useEffect } from 'react'
import { Minus, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { MenuItem, CartItem, Order } from '@/lib/types'
import { rp, orderSum, Picked, togglePick, pickedComplete, pickedLine } from '@/lib/utils'
import { isConnected, printReceipt } from '@/lib/printer'
import Modal from '@/components/Modal'
import ConfirmModal from '@/components/ConfirmModal'

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
  const [loading, setLoading] = useState(false)
  const [optionItem, setOptionItem] = useState<MenuItem | null>(null)
  const [pendingOpts, setPendingOpts] = useState<Picked>({})
  const [confirmClear, setConfirmClear] = useState(false)
  const [diningType, setDiningType] = useState<'makan_ditempat' | 'dibungkus' | null>(null)
  const [diningError, setDiningError] = useState(false)

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

  function doAddToCart(item: MenuItem, picked: Picked) {
    const line = pickedLine(item, item.options ?? [], picked)
    const cartKey = line.key ? `${item.id}::${line.key}` : item.id

    setCart(prev => {
      const ex = prev.find(c => c.cartKey === cartKey)
      if (ex) return prev.map(c => c.cartKey === cartKey ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { menuId: item.id, cartKey, name: line.name, price: line.price, qty: 1, note: '' }]
    })
  }

  function adjustQty(cartKey: string, delta: number) {
    setCart(prev => {
      const updated = prev.map(c => c.cartKey === cartKey ? { ...c, qty: c.qty + delta } : c)
      return updated.filter(c => c.qty > 0)
    })
  }

  function clearCart() {
    if (cart.length > 0) { setConfirmClear(true); return }
    doClearCart()
  }

  function doClearCart() {
    setCart([])
    setCustomerName('')
    setDiningType(null)
    setConfirmClear(false)
  }

  function updateNote(cartKey: string, note: string) {
    setCart(prev => prev.map(c => c.cartKey === cartKey ? { ...c, note } : c))
  }

  const total = orderSum(cart)

  async function saveOrder() {
    if (!cart.length) return
    if (!diningType) { setDiningError(true); return }
    setLoading(true)
    const name = customerName.trim()

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        ...(name && { customer_name: name }),
        status: 'open',
        total,
        source: 'kasir',
        dining_type: diningType,
      })
      .select()
      .single()

    if (error || !order) { onToast('Gagal menyimpan pesanan. Coba lagi.'); setLoading(false); return }

    const { error: itemsError } = await supabase.from('order_items').insert(
      cart.map(c => ({
        order_id: order.id,
        menu_item_id: c.menuId,
        name: c.name,
        price: c.price,
        qty: c.qty,
        note: c.note || null,
      }))
    )
    if (itemsError) { onToast('Gagal menyimpan item pesanan. Cek di Antrian.'); setLoading(false); return }

    const fullOrder: Order = {
      ...order,
      order_items: cart.map(c => ({ id: '', order_id: order.id, menu_item_id: c.menuId, name: c.name, price: c.price, qty: c.qty, note: c.note || null })),
    }

    doClearCart()
    setLoading(false)
    onOrderCreated()
    onToast(`✓ Pesanan #${order.queue_no} disimpan`)
    autoPrint(fullOrder)
  }

  function autoPrint(o: Order) {
    if (localStorage.getItem('auto_print') !== 'true') return
    const text = buildReceipt(o)
    if (isConnected()) {
      printReceipt(text).catch(() => onToast('Gagal print ke printer Bluetooth'))
    } else {
      const pz = document.getElementById('print-zone')
      if (pz) pz.textContent = text
      setTimeout(() => window.print(), 150)
    }
  }

  function buildReceipt(o: Order): string {
    const line = '--------------------------------'
    const jenis = o.dining_type === 'dibungkus' ? 'Dibungkus' : 'Di Tempat'
    const nama = o.customer_name && o.customer_name !== 'Tamu' ? ` · ${o.customer_name}` : ''
    let r = `KASIR KANTIN\n${line}\nAntrian   : #${o.queue_no}${nama}\nJenis     : ${jenis}\n${line}\n`
    o.order_items?.forEach(i => {
      r += `${i.name}\n`
      if (i.note) r += `  * ${i.note}\n`
      r += `  ${i.qty} x ${rp(i.price).padEnd(12)}${rp(i.price * i.qty)}\n`
    })
    r += `${line}\nTOTAL     : ${rp(o.total)}\nSTATUS    : BELUM DIBAYAR\n${line}\n      Terima kasih! 😊`
    return r
  }

  const allOptsSelected = optionItem
    ? pickedComplete(optionItem.options ?? [], pendingOpts)
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
              className={`px-3.5 py-1.5 rounded-full text-[length:calc(12px*var(--fs))] font-semibold whitespace-nowrap flex-shrink-0 border-[1.5px] transition-all
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
        <div className="flex-1 overflow-y-auto p-2.5 grid grid-cols-[repeat(auto-fill,minmax(calc(110px*var(--fs)),1fr))] gap-2 content-start">
          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-[var(--color-muted)]">
              <span className="text-4xl mb-2">🍽️</span>
              <p className="text-sm font-semibold text-[var(--color-text)]">Belum ada menu</p>
              <p className="text-xs">Tambah di tab Menu</p>
            </div>
          )}
          {filtered.map(item => {
            const isHabis = item.stock !== null && item.stock === 0
            const isMenipis = item.stock !== null && item.stock > 0 && item.stock <= item.stock_threshold
            return (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                disabled={!item.available}
                className={`bg-white border-[1.5px] border-[var(--color-border)] rounded-[10px] p-3 text-left flex flex-col gap-1 relative
                  transition-all shadow-[0_1px_2px_rgba(20,35,25,0.08)]
                  ${item.available
                    ? 'cursor-pointer hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] hover:-translate-y-px hover:shadow-md active:scale-95'
                    : 'opacity-40 cursor-not-allowed'
                  }
                  ${isHabis ? 'border-[var(--color-danger-light)] bg-[var(--color-danger-light)]/30' : ''}`}
              >
                <span className={`text-[length:calc(12px*var(--fs))] font-bold leading-tight ${isHabis ? 'pr-[calc(30px*var(--fs))]' : isMenipis ? 'pr-[calc(14px*var(--fs))]' : ''}`}>{item.name}</span>
                <span className="text-[length:calc(12px*var(--fs))] font-extrabold text-[var(--color-primary)] tabular-nums whitespace-nowrap">{rp(item.price)}</span>
                <span className="text-[length:calc(10px*var(--fs))] text-[var(--color-muted)]">{item.category}</span>
                {(item.options ?? []).length > 0 && (
                  <span className="text-[length:calc(9px*var(--fs))] text-[var(--color-primary)] font-semibold opacity-70">▾ ada pilihan</span>
                )}
                {isHabis && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[length:calc(9px*var(--fs))] font-bold bg-[var(--color-danger)] text-white">Habis</span>
                )}
                {isMenipis && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[length:calc(9px*var(--fs))] font-bold bg-amber-400 text-white">{item.stock}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Order panel */}
      <div className="w-full sm:w-[calc(290px*var(--fs))] flex-shrink-0 bg-white flex flex-col max-h-[42vh] sm:max-h-none">
        <div className="px-3.5 py-2.5 border-b border-[var(--color-border)] flex-shrink-0 flex items-center justify-between">
          <span className="text-[length:calc(11px*var(--fs))] font-extrabold uppercase tracking-wider text-[var(--color-muted)]">Pesanan</span>
          <button onClick={clearCart} className="text-[length:calc(11px*var(--fs))] font-semibold text-[var(--color-muted)] bg-[var(--color-surface2)] border border-[var(--color-border)] px-2 py-1 rounded-md hover:text-[var(--color-text)] transition-colors">
            Bersihkan Pesanan
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3.5">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--color-muted)] py-6">
              <span className="text-4xl opacity-40">🛒</span>
              <span className="text-[length:calc(12px*var(--fs))]">Ketuk item menu untuk menambahkan</span>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.cartKey} className="py-2.5 border-b border-[var(--color-border-lt)]">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[length:calc(12px*var(--fs))] font-semibold leading-tight">{item.name}</div>
                    <div className="text-[length:calc(11px*var(--fs))] text-[var(--color-muted)] tabular-nums mt-0.5">
                      {rp(item.price)} × {item.qty} = {rp(item.price * item.qty)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => adjustQty(item.cartKey, -1)} className="w-[calc(22px*var(--fs))] h-[calc(22px*var(--fs))] rounded-full border-[1.5px] border-[var(--color-danger-light)] text-[var(--color-danger)] flex items-center justify-center hover:bg-[var(--color-danger-light)] transition-colors">
                      <Minus size={10} className="size-[calc(10px*var(--fs))]" strokeWidth={3} />
                    </button>
                    <span className="text-[length:calc(13px*var(--fs))] font-extrabold min-w-[calc(18px*var(--fs))] text-center tabular-nums">{item.qty}</span>
                    <button onClick={() => adjustQty(item.cartKey, 1)} className="w-[calc(22px*var(--fs))] h-[calc(22px*var(--fs))] rounded-full border-[1.5px] border-[var(--color-success-light)] text-[var(--color-success)] flex items-center justify-center hover:bg-[var(--color-success-light)] transition-colors">
                      <Plus size={10} className="size-[calc(10px*var(--fs))]" strokeWidth={3} />
                    </button>
                  </div>
                </div>
                <input
                  value={item.note}
                  onChange={e => updateNote(item.cartKey, e.target.value)}
                  placeholder="Catatan... (cth: tidak pedas)"
                  className="w-full mt-1.5 px-2 py-1 text-[length:calc(11px*var(--fs))] border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-primary)] placeholder:text-[var(--color-muted)] bg-transparent"
                />
              </div>
            ))
          )}
        </div>

        <div className="px-3.5 py-3 border-t border-[var(--color-border)] flex-shrink-0">
          <div className="flex justify-between items-baseline mb-2.5">
            <span className="text-[length:calc(11px*var(--fs))] font-extrabold uppercase tracking-wider text-[var(--color-muted)]">Total</span>
            <span className="text-[length:calc(20px*var(--fs))] font-extrabold tabular-nums">{rp(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-1">
            {([
              { id: 'makan_ditempat', label: '🍽️ Makan di Tempat' },
              { id: 'dibungkus', label: '🥡 Bungkus' },
            ] as const).map(opt => (
              <button key={opt.id} type="button"
                onClick={() => { setDiningType(opt.id); setDiningError(false) }}
                className={`px-2 py-3 rounded-xl text-[length:calc(13px*var(--fs))] font-extrabold border-2 transition-all leading-tight
                  ${diningType === opt.id
                    ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                    : diningError
                    ? 'bg-[var(--color-danger-light)] border-[var(--color-danger)] text-[var(--color-text)]'
                    : 'bg-[var(--color-surface2)] border-[var(--color-border)] text-[var(--color-text)]'
                  }`}>
                {opt.label}
              </button>
            ))}
          </div>
          {diningError && <p className="text-[length:calc(12px*var(--fs))] text-[var(--color-danger)] font-bold mb-1">Pilih Makan di Tempat atau Bungkus</p>}
          <input
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="Nama pelanggan (boleh kosong)"
            className="w-full mt-1 mb-2 px-3 py-2 border-[1.5px] border-[var(--color-border)] rounded-lg text-[length:calc(13px*var(--fs))] outline-none bg-transparent focus:border-[var(--color-primary)] placeholder:text-[var(--color-muted)]"
          />
          <button onClick={saveOrder} disabled={!cart.length || loading}
            className="w-full py-4 rounded-xl bg-[var(--color-success)] text-white text-[length:calc(16px*var(--fs))] font-extrabold disabled:opacity-40 active:scale-[0.98] transition-transform">
            {loading ? 'Menyimpan...' : '✓ Simpan Pesanan'}
          </button>
        </div>
      </div>

      {/* Option selection modal */}
      {optionItem && (
        <Modal center onClose={() => setOptionItem(null)}>
          <h2 className="text-[length:calc(16px*var(--fs))] font-extrabold text-center mb-1">{optionItem.name}</h2>
          <p className="text-center text-[length:calc(14px*var(--fs))] font-bold text-[var(--color-primary)] mb-4">{rp(pickedLine(optionItem, optionItem.options ?? [], pendingOpts).price)}</p>
          {(optionItem.options ?? []).map((group, gi) => (
            <div key={gi} className="mb-4">
              <label className="block text-[length:calc(11px*var(--fs))] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-2">
                {group.name} {group.multi ? '(boleh lebih dari satu)' : '*'}
              </label>
              <div className="flex flex-wrap gap-2">
                {group.choices.map(choice => (
                  <button
                    key={choice}
                    onClick={() => setPendingOpts(prev => togglePick(prev, group, choice))}
                    className={`px-3.5 py-2 rounded-lg text-[length:calc(13px*var(--fs))] font-semibold border-[1.5px] transition-all
                      ${pendingOpts[group.name]?.includes(choice)
                        ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                        : 'bg-white border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]'
                      }`}
                  >
                    {choice}{group.prices?.[choice] ? ` +${group.prices[choice].toLocaleString('id-ID')}` : ''}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            onClick={() => { doAddToCart(optionItem, pendingOpts); setOptionItem(null) }}
            disabled={!allOptsSelected}
            className="w-full py-2.5 rounded-lg text-[length:calc(13px*var(--fs))] font-bold bg-[var(--color-primary)] text-white mb-1.5 disabled:opacity-40 hover:bg-[var(--color-primary-mid)] transition-colors"
          >
            ➕ Tambah ke Pesanan
          </button>
          <button onClick={() => setOptionItem(null)} className="w-full py-2.5 rounded-lg text-[length:calc(13px*var(--fs))] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
            Batal
          </button>
        </Modal>
      )}

      {confirmClear && (
        <ConfirmModal
          title="Bersihkan Pesanan?"
          message="Semua item di keranjang akan dihapus."
          confirmLabel="Ya, Bersihkan"
          danger
          onConfirm={doClearCart}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      <div id="print-zone" className="hidden" />
    </div>
  )
}

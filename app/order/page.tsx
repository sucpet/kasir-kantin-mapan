'use client'
import { useState, useEffect } from 'react'
import { Minus, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { MenuItem, MenuOption } from '@/lib/types'
import { rp, orderSum } from '@/lib/utils'

type CartItem = {
  menuId: string
  cartKey: string
  name: string
  price: number
  qty: number
  note: string
}

export default function OrderPage() {
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [activeCat, setActiveCat] = useState('Semua')
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [optionItem, setOptionItem] = useState<MenuItem | null>(null)
  const [pendingOpts, setPendingOpts] = useState<Record<string, string>>({})
  const [customerName, setCustomerName] = useState('')
  const [nameError, setNameError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const t = p.get('table')
    if (t) setCustomerName(t)
    loadMenu()
  }, [])

  async function loadMenu() {
    const { data } = await supabase
      .from('menu_items')
      .select('*')
      .eq('available', true)
      .order('category')
      .order('name')
    if (!data) return
    setMenu(data)
    setCategories([...new Set(data.map((i: MenuItem) => i.category))])
  }

  function tapped(item: MenuItem) {
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
      return [...prev, { menuId: item.id, cartKey, name: displayName, price: item.price, qty: 1, note: '' }]
    })
    setOptionItem(null)
  }

  function adjustQty(cartKey: string, delta: number) {
    setCart(prev =>
      prev.map(c => c.cartKey === cartKey ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0)
    )
  }

  function updateNote(cartKey: string, note: string) {
    setCart(prev => prev.map(c => c.cartKey === cartKey ? { ...c, note } : c))
  }

  const total = orderSum(cart)
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)
  const filtered = activeCat === 'Semua' ? menu : menu.filter(i => i.category === activeCat)

  async function submitOrder() {
    if (!customerName.trim()) { setNameError(true); return }
    setLoading(true)
    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        customer_name: customerName.trim(),
        status: 'open',
        total,
        paid_amount: null,
        paid_at: null,
        payment_method: null,
        source: 'customer',
      })
      .select()
      .single()
    if (error || !order) { setLoading(false); return }
    await supabase.from('order_items').insert(
      cart.map(c => ({
        order_id: order.id,
        menu_item_id: c.menuId,
        name: c.name,
        price: c.price,
        qty: c.qty,
        note: c.note || null,
      }))
    )
    setLoading(false)
    setCart([])
    setShowCart(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-[var(--color-bg)] flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-[22px] font-extrabold mb-2 text-[var(--color-text)]">Pesanan Diterima!</h1>
        <p className="text-[14px] text-[var(--color-muted)] mb-6 max-w-[260px]">
          Pesananmu sudah masuk dan sedang diproses. Silakan tunggu ya!
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="px-6 py-3 bg-[var(--color-primary)] text-white rounded-xl text-[14px] font-bold"
        >
          Pesan Lagi
        </button>
      </main>
    )
  }

  return (
    <main className="flex flex-col min-h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <header className="bg-[var(--color-primary)] text-white px-4 py-3 flex-shrink-0">
        <div className="text-[10px] font-medium tracking-[0.08em] uppercase opacity-60">Pesan Mandiri</div>
        <div className="text-[18px] font-extrabold">Kasir Kantin Mapan</div>
      </header>

      {/* Category bar — full-width bg, content centered */}
      <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] flex-shrink-0">
        <div
          className="max-w-2xl mx-auto px-3 py-2 flex gap-2"
          style={{ overflowX: 'auto', scrollbarWidth: 'none' }}
        >
          {['Semua', ...categories].map(c => (
            <button key={c} onClick={() => setActiveCat(c)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap border-[1.5px] flex-shrink-0 transition-all
                ${activeCat === c
                  ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                  : 'border-[var(--color-border)] text-[var(--color-muted)]'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Menu grid — constrained width on desktop */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-3 pb-24">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map(item => {
            const cartItem = cart.find(c => c.menuId === item.id)
            const inCart = cartItem && (item.options ?? []).length === 0 ? cartItem.qty : 0
            return (
              <div key={item.id}
                className="bg-[var(--color-surface)] border-[1.5px] border-[var(--color-border)] rounded-[12px] overflow-hidden flex flex-col">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full aspect-[4/3] object-cover flex-shrink-0" />
                ) : (
                  <div className="w-full aspect-[4/3] bg-[var(--color-surface2)] flex items-center justify-center flex-shrink-0 text-3xl">
                    🍽️
                  </div>
                )}
                <div className="p-3 flex flex-col gap-2 flex-1">
                <div>
                  <div className="text-[13px] font-bold leading-tight text-[var(--color-text)]">{item.name}</div>
                  <div className="text-[14px] font-extrabold text-[var(--color-primary)] tabular-nums mt-0.5">{rp(item.price)}</div>
                  {(item.options ?? []).length > 0 && (
                    <div className="text-[9px] text-[var(--color-primary)] font-semibold mt-0.5 opacity-70">ada pilihan ▾</div>
                  )}
                </div>
                {inCart > 0 ? (
                  <div className="flex items-center justify-between">
                    <button onClick={() => adjustQty(item.id, -1)}
                      className="w-7 h-7 rounded-full border-[1.5px] border-[var(--color-border)] text-[var(--color-muted)] flex items-center justify-center hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors">
                      <Minus size={11} strokeWidth={3} />
                    </button>
                    <span className="text-[14px] font-extrabold tabular-nums text-[var(--color-text)]">{inCart}</span>
                    <button onClick={() => adjustQty(item.id, 1)}
                      className="w-7 h-7 rounded-full border-[1.5px] border-[var(--color-border)] text-[var(--color-primary)] flex items-center justify-center hover:bg-[var(--color-primary)] hover:text-white transition-colors">
                      <Plus size={11} strokeWidth={3} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => tapped(item)}
                    className="w-full py-1.5 rounded-lg text-[12px] font-bold bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity">
                    {cart.some(c => c.menuId === item.id) ? '+ Tambah Lagi' : '+ Tambah'}
                  </button>
                )}
                </div>
              </div>
            )
          })}
        </div>
        </div>
      </div>

      {/* Floating cart button */}
      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-4 left-0 right-0 px-4 z-40">
          <button onClick={() => setShowCart(true)}
            className="w-full max-w-md mx-auto flex items-center justify-between bg-[var(--color-primary)] text-white rounded-xl px-5 py-3 shadow-xl">
            <span className="text-[13px] font-bold flex items-center gap-2">
              🛒 <span className="bg-white/20 px-2 py-0.5 rounded-full text-[11px]">{cartCount} item</span>
            </span>
            <span className="text-[14px] font-extrabold tabular-nums">{rp(total)}</span>
          </button>
        </div>
      )}

      {/* Option selection sheet */}
      {optionItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
          <div className="w-full bg-[var(--color-surface)] rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto">
            <div className="w-9 h-1 bg-[var(--color-border)] rounded-full mx-auto mb-4" />
            <h3 className="text-[15px] font-extrabold mb-1 text-[var(--color-text)]">{optionItem.name}</h3>
            <p className="text-[12px] text-[var(--color-muted)] mb-4">{rp(optionItem.price)}</p>
            {optionItem.options.map((opt: MenuOption) => (
              <div key={opt.name} className="mb-4">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-muted)] mb-2">{opt.name}</p>
                <div className="flex flex-wrap gap-2">
                  {opt.choices.map(ch => (
                    <button key={ch} type="button"
                      onClick={() => setPendingOpts(prev => ({ ...prev, [opt.name]: ch }))}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border-[1.5px] transition-all
                        ${pendingOpts[opt.name] === ch
                          ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                          : 'border-[var(--color-border)] text-[var(--color-text)]'}`}>
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={() => {
                const allPicked = optionItem.options.every((o: MenuOption) => pendingOpts[o.name])
                if (allPicked) doAddToCart(optionItem, pendingOpts)
              }}
              disabled={!optionItem.options.every((o: MenuOption) => pendingOpts[o.name])}
              className="w-full py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-[13px] font-bold mb-2 disabled:opacity-40">
              + Tambah ke Keranjang
            </button>
            <button onClick={() => setOptionItem(null)}
              className="w-full py-2.5 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[13px] font-semibold text-[var(--color-muted)]">
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Cart / order confirmation sheet */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
          <div className="w-full bg-[var(--color-surface)] rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto">
            <div className="w-9 h-1 bg-[var(--color-border)] rounded-full mx-auto mb-4" />
            <h2 className="text-[16px] font-extrabold mb-4 text-[var(--color-text)]">🛒 Pesanan Kamu</h2>

            <div className="mb-4">
              {cart.map(i => (
                <div key={i.cartKey} className="py-2.5 border-b border-[var(--color-border-lt)]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[var(--color-text)] flex-1">{i.name}</span>
                    <span className="text-[13px] tabular-nums text-[var(--color-muted)] flex-shrink-0">{rp(i.price * i.qty)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button onClick={() => adjustQty(i.cartKey, -1)}
                      className="w-6 h-6 rounded-full border border-[var(--color-border)] text-[var(--color-muted)] flex items-center justify-center hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors">
                      <Minus size={10} strokeWidth={3} />
                    </button>
                    <span className="text-[13px] font-bold tabular-nums w-4 text-center text-[var(--color-text)]">{i.qty}</span>
                    <button onClick={() => adjustQty(i.cartKey, 1)}
                      className="w-6 h-6 rounded-full border border-[var(--color-border)] text-[var(--color-primary)] flex items-center justify-center hover:bg-[var(--color-primary)] hover:text-white transition-colors">
                      <Plus size={10} strokeWidth={3} />
                    </button>
                    <input value={i.note} onChange={e => updateNote(i.cartKey, e.target.value)}
                      placeholder="Catatan..."
                      className="text-[11px] px-2 py-1 border border-[var(--color-border)] rounded-md outline-none focus:border-[var(--color-primary)] bg-transparent placeholder:text-[var(--color-muted)] flex-1 text-[var(--color-text)]" />
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-[16px] font-extrabold mt-3 pt-2 border-t border-[var(--color-border)]">
                <span className="text-[var(--color-text)]">Total</span>
                <span className="tabular-nums text-[var(--color-primary)]">{rp(total)}</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1">
                Nama / No. Meja *
              </label>
              <input
                autoFocus
                value={customerName}
                onChange={e => { setCustomerName(e.target.value); if (e.target.value.trim()) setNameError(false) }}
                placeholder="cth: Meja 3 atau nama kamu"
                className={`w-full px-3 py-2.5 border-[1.5px] rounded-xl text-[13px] outline-none transition-colors bg-transparent text-[var(--color-text)]
                  ${nameError ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)] focus:border-[var(--color-primary)]'}`}
              />
              {nameError && <p className="text-[11px] text-[var(--color-danger)] mt-1 font-semibold">Nama / meja wajib diisi</p>}
            </div>

            <button onClick={submitOrder} disabled={loading}
              className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white text-[14px] font-bold mb-2 disabled:opacity-50">
              {loading ? 'Mengirim...' : '✅ Kirim Pesanan'}
            </button>
            <button onClick={() => setShowCart(false)}
              className="w-full py-2.5 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[13px] font-semibold text-[var(--color-muted)]">
              Kembali ke Menu
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

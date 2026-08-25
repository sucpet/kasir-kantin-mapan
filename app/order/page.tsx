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

type Customer = { name: string; points: number }

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
  const [qrisImageUrl, setQrisImageUrl] = useState('')
  const [lastOrderName, setLastOrderName] = useState('')
  const [lastOrderTotal, setLastOrderTotal] = useState(0)
  const [lastOrderItems, setLastOrderItems] = useState<CartItem[]>([])
  const [paymentSuffix, setPaymentSuffix] = useState(0)
  // Auth
  const [authStep, setAuthStep] = useState<'login' | 'register' | 'done'>('login')
  const [loginPhone, setLoginPhone] = useState('')
  const [loginError, setLoginError] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerPhone, setRegisterPhone] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  // Loyalty points
  const [phone, setPhone] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [redeemAmt, setRedeemAmt] = useState(0)
  const [lastPointsEarned, setLastPointsEarned] = useState(0)
  const [lastPointsTotal, setLastPointsTotal] = useState(0)
  const [lastHadPhone, setLastHadPhone] = useState(false)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const t = p.get('table')
    if (t) setCustomerName(t)
    loadMenu()
    supabase.from('settings').select('value').eq('key', 'qris_image_url').maybeSingle()
      .then(({ data }) => { if (data?.value) setQrisImageUrl(data.value) })
  }, [])

  function normalizePhone(raw: string): string {
    let d = raw.replace(/\D/g, '')
    if (d.startsWith('62')) d = '0' + d.slice(2)
    if (d.startsWith('8')) d = '0' + d
    return d
  }

  async function handleLogin() {
    const norm = normalizePhone(loginPhone)
    if (!norm.startsWith('08') || norm.length < 10) {
      setLoginError('Format nomor tidak valid (cth: 08123456789)')
      return
    }
    setAuthLoading(true)
    setLoginError('')
    const { data } = await supabase.from('customers').select('name, points').eq('phone', norm).maybeSingle()
    setAuthLoading(false)
    if (data) {
      setPhone(norm)
      setCustomer(data)
      setCustomerName(data.name)
      setAuthStep('done')
    } else {
      setRegisterPhone(norm)
      setRegisterName('')
      setRegisterError('')
      setAuthStep('register')
    }
  }

  async function handleRegister() {
    const norm = normalizePhone(registerPhone)
    if (!registerName.trim()) { setRegisterError('Nama wajib diisi'); return }
    if (!norm.startsWith('08') || norm.length < 10) { setRegisterError('Format nomor tidak valid (cth: 08123456789)'); return }
    setAuthLoading(true)
    setRegisterError('')
    const { error } = await supabase.from('customers').insert({ phone: norm, name: registerName.trim(), points: 0 })
    setAuthLoading(false)
    if (error) { setRegisterError('Nomor sudah terdaftar atau terjadi kesalahan'); return }
    setPhone(norm)
    setCustomer({ name: registerName.trim(), points: 0 })
    setCustomerName(registerName.trim())
    setAuthStep('done')
  }

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
  const safeRedeem = Math.min(redeemAmt, customer?.points ?? 0, total)
  const netTotal = total - safeRedeem
  const cartCount = cart.reduce((s, c) => s + c.qty, 0)
  const filtered = activeCat === 'Semua' ? menu : menu.filter(i => i.category === activeCat)

  async function submitOrder() {
    if (!customerName.trim()) { setNameError(true); return }
    setLoading(true)

    const normalizedPhone = phone.replace(/\D/g, '')
    const suffix = Math.floor(Math.random() * 400)
    const safeRedeem = Math.min(redeemAmt, customer?.points ?? 0, total)
    const netTotal = total - safeRedeem

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        customer_name: customerName.trim(),
        status: 'open',
        total: netTotal,
        paid_amount: null,
        paid_at: null,
        payment_method: qrisImageUrl ? 'QRIS' : null,
        source: 'customer',
        customer_phone: normalizedPhone || null,
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

    // Update loyalty points
    let newPoints = 0
    if (normalizedPhone) {
      const base = customer?.points ?? 0
      newPoints = base - safeRedeem + suffix
      await supabase.from('customers').upsert(
        { phone: normalizedPhone, name: customerName.trim(), points: newPoints },
        { onConflict: 'phone' }
      )
    }

    setLastOrderName(customerName.trim())
    setLastOrderTotal(netTotal)
    setLastOrderItems([...cart])
    setPaymentSuffix(suffix)
    setLastPointsEarned(suffix)
    setLastPointsTotal(newPoints)
    setLastHadPhone(!!normalizedPhone)
    setLoading(false)
    setCart([])
    setRedeemAmt(0)
    setShowCart(false)
    setSubmitted(true)
  }

  const authHeader = (
    <header className="bg-[var(--color-primary)] text-white px-4 py-3 flex-shrink-0">
      <div className="text-[10px] font-medium tracking-[0.08em] uppercase opacity-60">Pesan Mandiri</div>
      <div className="text-[18px] font-extrabold">Kasir Kantin Mapan</div>
    </header>
  )

  if (authStep === 'login') {
    return (
      <main className="flex flex-col min-h-screen bg-[var(--color-bg)]">
        {authHeader}
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">👋</div>
              <h1 className="text-[22px] font-extrabold text-[var(--color-text)]">Masuk</h1>
              <p className="text-[13px] text-[var(--color-muted)] mt-1">Masukkan nomor WhatsApp kamu</p>
            </div>
            <div className="mb-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                Nomor WhatsApp
              </label>
              <input
                autoFocus
                type="tel"
                inputMode="numeric"
                value={loginPhone}
                onChange={e => { setLoginPhone(e.target.value); setLoginError('') }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="08123456789"
                className={`w-full px-4 py-3 border-[1.5px] rounded-xl text-[15px] outline-none transition-colors bg-transparent text-[var(--color-text)]
                  ${loginError ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)] focus:border-[var(--color-primary)]'}`}
              />
              {loginError && <p className="text-[12px] text-[var(--color-danger)] mt-1.5 font-semibold">{loginError}</p>}
            </div>
            <button
              onClick={handleLogin}
              disabled={authLoading || loginPhone.length < 5}
              className="w-full py-3.5 rounded-xl bg-[var(--color-primary)] text-white text-[15px] font-bold mb-3 disabled:opacity-40"
            >
              {authLoading ? 'Mencari...' : 'Masuk'}
            </button>
            <div className="text-center">
              <span className="text-[12px] text-[var(--color-muted)]">Belum punya akun? </span>
              <button
                onClick={() => { setRegisterPhone(normalizePhone(loginPhone)); setRegisterName(''); setRegisterError(''); setAuthStep('register') }}
                className="text-[12px] font-bold text-[var(--color-primary)] hover:underline"
              >
                Daftar sekarang
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (authStep === 'register') {
    return (
      <main className="flex flex-col min-h-screen bg-[var(--color-bg)]">
        {authHeader}
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">📝</div>
              <h1 className="text-[22px] font-extrabold text-[var(--color-text)]">Daftar</h1>
              <p className="text-[13px] text-[var(--color-muted)] mt-1">
                {registerPhone ? `Nomor ${registerPhone} belum terdaftar` : 'Buat akun baru'}
              </p>
            </div>
            <div className="mb-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                Nama
              </label>
              <input
                autoFocus
                type="text"
                value={registerName}
                onChange={e => { setRegisterName(e.target.value); setRegisterError('') }}
                placeholder="Nama kamu"
                className={`w-full px-4 py-3 border-[1.5px] rounded-xl text-[15px] outline-none transition-colors bg-transparent text-[var(--color-text)]
                  ${registerError && !registerName.trim() ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)] focus:border-[var(--color-primary)]'}`}
              />
            </div>
            <div className="mb-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                Nomor WhatsApp
              </label>
              <input
                type="tel"
                inputMode="numeric"
                value={registerPhone}
                onChange={e => { setRegisterPhone(e.target.value); setRegisterError('') }}
                onKeyDown={e => e.key === 'Enter' && handleRegister()}
                placeholder="08123456789"
                className={`w-full px-4 py-3 border-[1.5px] rounded-xl text-[15px] outline-none transition-colors bg-transparent text-[var(--color-text)]
                  ${registerError && registerName.trim() ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)] focus:border-[var(--color-primary)]'}`}
              />
            </div>
            {registerError && <p className="text-[12px] text-[var(--color-danger)] mb-2 font-semibold">{registerError}</p>}
            <button
              onClick={handleRegister}
              disabled={authLoading}
              className="w-full py-3.5 rounded-xl bg-[var(--color-primary)] text-white text-[15px] font-bold mb-3 disabled:opacity-40"
            >
              {authLoading ? 'Mendaftarkan...' : 'Daftar'}
            </button>
            <div className="text-center">
              <span className="text-[12px] text-[var(--color-muted)]">Sudah punya akun? </span>
              <button
                onClick={() => { setLoginError(''); setAuthStep('login') }}
                className="text-[12px] font-bold text-[var(--color-primary)] hover:underline"
              >
                Masuk
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (submitted) {
    return (
      <main className="flex flex-col min-h-screen bg-[var(--color-bg)]">
        <header className="bg-[var(--color-primary)] text-white px-4 py-3 flex-shrink-0">
          <div className="text-[10px] font-medium tracking-[0.08em] uppercase opacity-60">Pesan Mandiri</div>
          <div className="text-[18px] font-extrabold">Kasir Kantin Mapan</div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-sm mx-auto p-5 pb-10">
            <div className="text-center mb-5">
              <div className="text-5xl mb-3">✅</div>
              <h1 className="text-[20px] font-extrabold text-[var(--color-text)]">Pesanan Diterima!</h1>
              <p className="text-[13px] text-[var(--color-primary)] font-bold mt-0.5">{lastOrderName}</p>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3.5 mb-5">
              {lastOrderItems.map(i => (
                <div key={i.cartKey} className="flex justify-between text-[12px] py-0.5">
                  <span className="text-[var(--color-text)]">{i.name} ×{i.qty}</span>
                  <span className="text-[var(--color-muted)] tabular-nums">{rp(i.price * i.qty)}</span>
                </div>
              ))}
              <div className="flex justify-between text-[15px] font-extrabold mt-2.5 pt-2.5 border-t border-[var(--color-border)]">
                <span className="text-[var(--color-text)]">Total</span>
                <span className="tabular-nums text-[var(--color-primary)]">{rp(lastOrderTotal)}</span>
              </div>
              {qrisImageUrl && (
                <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-dashed border-[var(--color-border)]">
                  <span className="text-[11px] text-[var(--color-muted)]">Nominal transfer</span>
                  <span className="text-[16px] font-extrabold tabular-nums text-[var(--color-accent-text)]">{rp(lastOrderTotal + paymentSuffix)}</span>
                </div>
              )}
            </div>

            {qrisImageUrl ? (
              <>
                <div className="text-center mb-3">
                  <p className="text-[12px] font-bold text-[var(--color-muted)] uppercase tracking-wider">Bayar via QRIS</p>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-[var(--color-border)] mb-3">
                  <img src={qrisImageUrl} alt="QRIS" className="w-full max-w-[220px] object-contain mx-auto block" />
                </div>
                <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-3.5 mb-5 text-center">
                  <p className="text-[12px] text-[var(--color-text)] font-semibold">Scan QR di atas dengan aplikasi pembayaranmu</p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-1">
                    Bayar tepat <span className="font-bold text-[var(--color-accent-text)]">{rp(lastOrderTotal + paymentSuffix)}</span> agar kasir bisa konfirmasi pesananmu
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 mb-5 text-center">
                <p className="text-[13px] text-[var(--color-text)] font-semibold">Silakan bayar ke kasir 👋</p>
              </div>
            )}

            {lastHadPhone && (
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3.5 mb-4 text-center">
                <p className="text-2xl mb-1">🎁</p>
                <p className="text-[13px] font-extrabold text-[var(--color-text)]">+{lastPointsEarned.toLocaleString('id')} poin diperoleh!</p>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                  Total poin kamu: <span className="font-bold text-[var(--color-primary)]">{lastPointsTotal.toLocaleString('id')} poin</span>
                </p>
              </div>
            )}
            <button
              onClick={() => { setSubmitted(false); setCustomerName(''); setRedeemAmt(0) }}
              className="w-full py-3 rounded-xl border-[1.5px] border-[var(--color-primary)] text-[var(--color-primary)] text-[13px] font-bold hover:bg-[var(--color-primary-light)] transition-colors"
            >
              Pesan Lagi
            </button>
          </div>
        </div>
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

      {/* Loyalty info bar */}
      <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-2 flex items-center justify-between flex-shrink-0">
        <span className="text-[12px] text-[var(--color-text)]">
          👋 <span className="font-bold">{customer?.name || phone}</span>
        </span>
        <span className="text-[12px] font-extrabold text-[var(--color-primary)]">
          {(customer?.points ?? 0).toLocaleString('id')} poin
        </span>
      </div>

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
                <div className="p-3 flex flex-col flex-1">
                <div className="flex-1">
                  <div className="text-[13px] font-bold leading-tight text-[var(--color-text)]">{item.name}</div>
                  <div className="text-[14px] font-extrabold text-[var(--color-primary)] tabular-nums mt-0.5">{rp(item.price)}</div>
                  {(item.options ?? []).length > 0 && (
                    <div className="text-[9px] text-[var(--color-primary)] font-semibold mt-0.5 opacity-70">ada pilihan ▾</div>
                  )}
                </div>
                <div className="mt-2">
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
              <div className="mt-3 pt-2 border-t border-[var(--color-border)]">
                <div className="flex justify-between text-[16px] font-extrabold">
                  <span className="text-[var(--color-text)]">Total</span>
                  <span className={`tabular-nums ${safeRedeem > 0 ? 'text-[var(--color-muted)] line-through text-[13px]' : 'text-[var(--color-primary)]'}`}>{rp(total)}</span>
                </div>
                {safeRedeem > 0 && (
                  <>
                    <div className="flex justify-between text-[12px] text-[var(--color-muted)] mt-0.5">
                      <span>Diskon poin</span>
                      <span className="tabular-nums text-[var(--color-accent-text)]">−{rp(safeRedeem)}</span>
                    </div>
                    <div className="flex justify-between text-[16px] font-extrabold mt-1">
                      <span className="text-[var(--color-text)]">Total Bayar</span>
                      <span className="tabular-nums text-[var(--color-primary)]">{rp(netTotal)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Redemption (only shown if customer has points) */}
            {customer && customer.points > 0 && (
              <div className="mb-3 p-3 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl">
                <p className="text-[12px] font-bold text-[var(--color-text)] mb-1.5">
                  🎁 Poin kamu: <span className="text-[var(--color-primary)]">{customer.points.toLocaleString('id')} poin</span>
                </p>
                <label className="text-[11px] text-[var(--color-muted)] font-semibold">
                  Gunakan poin (maks {Math.min(customer.points, total).toLocaleString('id')}):
                </label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="number"
                    min={0}
                    max={Math.min(customer.points, total)}
                    value={redeemAmt || ''}
                    onChange={e => setRedeemAmt(Math.min(Number(e.target.value) || 0, customer.points, total))}
                    placeholder="0"
                    className="flex-1 px-3 py-1.5 border-[1.5px] rounded-lg text-[13px] outline-none transition-colors bg-transparent text-[var(--color-text)] border-[var(--color-border)] focus:border-[var(--color-primary)] tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setRedeemAmt(Math.min(customer.points, total))}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-bold border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-colors"
                  >
                    Pakai Semua
                  </button>
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1">
                Nama / No. Meja *
              </label>
              <input
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
              {loading ? 'Mengirim...' : `✅ Kirim Pesanan${safeRedeem > 0 ? ` — ${rp(netTotal)}` : ''}`}
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

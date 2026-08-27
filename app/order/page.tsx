'use client'
import { useState, useEffect } from 'react'
import { Minus, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { MenuItem, MenuOption, Order } from '@/lib/types'
import { rp, orderSum, fmtTime } from '@/lib/utils'

type CartItem = {
  menuId: string
  cartKey: string
  name: string
  price: number
  qty: number
  note: string
}

type Customer = { name: string; points: number }

const SESSION_KEY = 'kantin_order_session'
const SESSION_TTL = 5 * 60 * 1000

type StoredSession = { phone: string; name: string; points: number; loginAt: number }

function getStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s: StoredSession = JSON.parse(raw)
    if (Date.now() - s.loginAt >= SESSION_TTL) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return s
  } catch { return null }
}

function saveSession(phone: string, customer: Customer) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    phone, name: customer.name, points: customer.points, loginAt: Date.now(),
  }))
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

export default function OrderPage() {
  const [menu, setMenu] = useState<MenuItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [activeCat, setActiveCat] = useState('Semua')
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [optionItem, setOptionItem] = useState<MenuItem | null>(null)
  const [pendingOpts, setPendingOpts] = useState<Record<string, string>>({})
  const [customerName, setCustomerName] = useState(() => getStoredSession()?.name ?? '')
  const [nameError, setNameError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [qrisImageUrl, setQrisImageUrl] = useState('')
  const [lastOrderName, setLastOrderName] = useState('')
  const [lastOriginalTotal, setLastOriginalTotal] = useState(0)
  const [lastSafeRedeem, setLastSafeRedeem] = useState(0)
  const [lastOrderTotal, setLastOrderTotal] = useState(0)
  const [lastOrderItems, setLastOrderItems] = useState<CartItem[]>([])
  const [paymentSuffix, setPaymentSuffix] = useState(0)
  // Auth
  const [authStep, setAuthStep] = useState<'login' | 'register' | 'done'>(() => getStoredSession() ? 'done' : 'login')
  const [loginPhone, setLoginPhone] = useState('')
  const [loginError, setLoginError] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerPhone, setRegisterPhone] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  // Loyalty points
  const [phone, setPhone] = useState(() => getStoredSession()?.phone ?? '')
  const [customer, setCustomer] = useState<Customer | null>(() => {
    const s = getStoredSession()
    return s ? { name: s.name, points: s.points } : null
  })
  const [redeemAmt, setRedeemAmt] = useState(0)
  const [lastPointsEarned, setLastPointsEarned] = useState(0)
  const [lastPointsTotal, setLastPointsTotal] = useState(0)
  const [lastHadPhone, setLastHadPhone] = useState(false)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [orderStatus, setOrderStatus] = useState<'open' | 'paid' | 'done'>('open')
  const [diningType, setDiningType] = useState<'makan_ditempat' | 'dibungkus' | null>(null)
  const [diningError, setDiningError] = useState(false)
  const [activeTab, setActiveTab] = useState<'menu' | 'riwayat'>('menu')
  const [orderHistory, setOrderHistory] = useState<Order[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [reorderMsg, setReorderMsg] = useState('')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const t = p.get('table')
    if (t) setCustomerName(t)
    loadMenu()
    supabase.from('settings').select('value').eq('key', 'qris_image_url').maybeSingle()
      .then(({ data }) => { if (data?.value) setQrisImageUrl(data.value) })
  }, [])

  // Realtime: track submitted order status live
  useEffect(() => {
    if (!submitted || !orderId) return
    const ch = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        async (payload) => {
          const status = (payload.new as { status: string }).status as 'open' | 'paid' | 'done'
          setOrderStatus(status)
          if ((status === 'paid' || status === 'done') && phone) {
            const { data } = await supabase.from('customers').select('points').eq('phone', phone).maybeSingle()
            if (data) {
              setCustomer(prev => {
                const updated = prev ? { ...prev, points: data.points } : null
                if (updated) saveSession(phone, updated)
                return updated
              })
              setLastPointsTotal(data.points)
            }
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [submitted, orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'riwayat' && phone) fetchHistory()
  }, [activeTab, phone]) // eslint-disable-line react-hooks/exhaustive-deps

  // Session expires 5 minutes after login — show login screen again, no page reload
  useEffect(() => {
    if (authStep !== 'done') return
    const timer = setTimeout(() => {
      clearSession()
      setAuthStep('login')
      setPhone('')
      setCustomer(null)
      setLoginPhone('')
      setRedeemAmt(0)
      setCart([])
      setSubmitted(false)
      setCustomerName('')
    }, SESSION_TTL)
    return () => clearTimeout(timer)
  }, [authStep])

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
      saveSession(norm, data)
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
    const newCustomer = { name: registerName.trim(), points: 0 }
    setPhone(norm)
    setCustomer(newCustomer)
    setCustomerName(registerName.trim())
    saveSession(norm, newCustomer)
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

  function isHabis(item: MenuItem): boolean {
    return item.stock !== null && item.stock === 0
  }

  function tapped(item: MenuItem) {
    if (isHabis(item)) return
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
    if (!diningType) { setDiningError(true); return }
    if (!customerName.trim()) { setNameError(true); return }
    setLoading(true)
    setSubmitError('')

    const { data, error } = await supabase.rpc('create_order', {
      p_customer_name:  customerName.trim(),
      p_customer_phone: phone || null,
      p_payment_method: qrisImageUrl ? 'QRIS' : null,
      p_source:         'customer',
      p_redeem_points:  redeemAmt,
      p_dining_type:    diningType,
      p_items: cart.map(c => ({
        menu_item_id: c.menuId,
        qty:          c.qty,
        note:         c.note || '',
        display_name: c.name,
      })),
    })

    if (error || !data) { setSubmitError('Gagal mengirim pesanan. Coba lagi.'); setLoading(false); return }

    const { order_id, original_total, safe_redeem, net_total, suffix, new_points } = data as {
      order_id: string; original_total: number; safe_redeem: number
      net_total: number; suffix: number; new_points: number
    }

    // Poin belum diaplikasikan — ditunda sampai kasir konfirmasi (trigger DB)
    setLastOrderName(customerName.trim())
    setLastOriginalTotal(original_total)
    setLastSafeRedeem(safe_redeem)
    setLastOrderTotal(net_total)
    setLastOrderItems([...cart])
    setPaymentSuffix(suffix)
    setLastPointsEarned(suffix)
    setLastPointsTotal(new_points) // poin saat ini (belum berubah), update via realtime
    setLastHadPhone(!!phone)
    setOrderId(order_id)
    setOrderStatus('open')
    setLoading(false)
    setCart([])
    setRedeemAmt(0)
    setDiningType(null)
    setDiningError(false)
    setShowCart(false)
    setSubmitted(true)
  }

  function fmtDateTime(iso: string) {
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    if (isToday) return 'Hari ini ' + fmtTime(iso)
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' + fmtTime(iso)
  }

  async function fetchHistory() {
    if (!phone) return
    setLoadingHistory(true)
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setOrderHistory(data)
    setLoadingHistory(false)
  }

  function reorder(histOrder: Order) {
    const items = histOrder.order_items ?? []
    let added = 0
    for (const oi of items) {
      if (!oi.menu_item_id) continue
      const mi = menu.find(m => m.id === oi.menu_item_id && m.available && !isHabis(m))
      if (!mi) continue
      for (let i = 0; i < oi.qty; i++) doAddToCart(mi, {})
      added++
    }
    if (added > 0) {
      setActiveTab('menu')
      setReorderMsg(`${added} jenis item ditambahkan ke keranjang 🛒`)
    } else {
      setReorderMsg('Item tidak tersedia atau habis')
    }
    setTimeout(() => setReorderMsg(''), 3000)
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
            <div className="text-center mb-4">
              <div className="text-5xl mb-2">✅</div>
              <h1 className="text-[20px] font-extrabold text-[var(--color-text)]">Pesanan Dikirim!</h1>
              <p className="text-[13px] text-[var(--color-primary)] font-bold mt-0.5">{lastOrderName}</p>
            </div>

            {/* Status live */}
            <div className={`rounded-xl p-3.5 mb-4 text-center border transition-all ${
              orderStatus === 'done'
                ? 'bg-[var(--color-success-light)] border-[var(--color-success)]'
                : orderStatus === 'paid'
                ? 'bg-[var(--color-info-light)] border-[var(--color-info)]'
                : 'bg-[var(--color-surface2)] border-[var(--color-border)]'
            }`}>
              <div className="text-2xl mb-1">
                {orderStatus === 'done' ? '🎉' : orderStatus === 'paid' ? '🍳' : '⏳'}
              </div>
              <div className={`text-[14px] font-extrabold ${
                orderStatus === 'done' ? 'text-[var(--color-success)]'
                : orderStatus === 'paid' ? 'text-[var(--color-info)]'
                : 'text-[var(--color-text)]'
              }`}>
                {orderStatus === 'done' ? 'Pesanan Siap! Silakan Diambil'
                : orderStatus === 'paid' ? 'Sedang Disiapkan...'
                : 'Menunggu Konfirmasi Kasir'}
              </div>
              <div className="text-[11px] text-[var(--color-muted)] mt-0.5">
                {orderStatus === 'done' ? 'Terima kasih sudah menunggu!'
                : orderStatus === 'paid' ? 'Kasir sudah mengonfirmasi pesananmu'
                : 'Pesananmu sedang dikonfirmasi...'}
              </div>
            </div>

            {/* Order summary */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3.5 mb-4">
              {lastOrderItems.map(i => (
                <div key={i.cartKey} className="flex justify-between text-[12px] py-0.5">
                  <span className="text-[var(--color-text)]">{i.name} ×{i.qty}</span>
                  <span className="text-[var(--color-muted)] tabular-nums">{rp(i.price * i.qty)}</span>
                </div>
              ))}
              <div className="mt-2.5 pt-2.5 border-t border-[var(--color-border)]">
                {lastSafeRedeem > 0 ? (
                  <>
                    <div className="flex justify-between text-[13px] font-semibold text-[var(--color-muted)]">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{rp(lastOriginalTotal)}</span>
                    </div>
                    <div className="flex justify-between text-[12px] mt-0.5">
                      <span className="text-[var(--color-muted)]">Poin ditukar ({lastSafeRedeem.toLocaleString('id')} poin)</span>
                      <span className="tabular-nums font-semibold text-[var(--color-accent-text)]">−{rp(lastSafeRedeem)}</span>
                    </div>
                    <div className="flex justify-between text-[15px] font-extrabold mt-1.5 pt-1.5 border-t border-dashed border-[var(--color-border)]">
                      <span className="text-[var(--color-text)]">Total Bayar</span>
                      <span className="tabular-nums text-[var(--color-primary)]">{rp(lastOrderTotal)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-[15px] font-extrabold">
                    <span className="text-[var(--color-text)]">Total Bayar</span>
                    <span className="tabular-nums text-[var(--color-primary)]">{rp(lastOrderTotal)}</span>
                  </div>
                )}
                {qrisImageUrl && (
                  <>
                    {paymentSuffix > 0 && (
                      <div className="flex justify-between text-[12px] text-[var(--color-muted)] mt-1">
                        <span>Kode unik</span>
                        <span className="tabular-nums">+{rp(paymentSuffix)}</span>
                      </div>
                    )}
                    <div className={`flex justify-between items-center mt-1.5 pt-1.5 border-t border-[var(--color-border)]`}>
                      <span className="text-[13px] font-bold text-[var(--color-text)]">Nominal Transfer</span>
                      <span className="text-[20px] font-extrabold tabular-nums text-[var(--color-accent-text)]">{rp(lastOrderTotal + paymentSuffix)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {qrisImageUrl ? (
              <>
                <div className="text-center mb-3">
                  <p className="text-[12px] font-bold text-[var(--color-muted)] uppercase tracking-wider">Bayar via QRIS</p>
                </div>
                <div className="bg-white rounded-2xl p-4 border border-[var(--color-border)] mb-3">
                  <img src={qrisImageUrl} alt="QRIS" className="w-full max-w-[220px] object-contain mx-auto block" />
                </div>
                <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-3.5 mb-4 text-center">
                  <p className="text-[12px] text-[var(--color-text)] font-semibold">Scan QR di atas dengan aplikasi pembayaranmu</p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-1">
                    Bayar tepat <span className="font-bold text-[var(--color-accent-text)]">{rp(lastOrderTotal + paymentSuffix)}</span> agar kasir bisa konfirmasi pesananmu
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl p-4 mb-4 text-center">
                <p className="text-[13px] text-[var(--color-text)] font-semibold">Silakan bayar ke kasir 👋</p>
              </div>
            )}

            {/* Points summary */}
            {lastHadPhone && (
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-3.5 mb-4">
                <p className="text-[12px] font-extrabold text-[var(--color-text)] mb-2">🎁 Poin Kamu</p>
                {lastSafeRedeem > 0 && (
                  <div className="flex justify-between text-[12px] mt-0.5">
                    <span className="text-[var(--color-muted)]">Poin ditukar</span>
                    <span className="tabular-nums font-bold text-[var(--color-accent-text)]">−{lastSafeRedeem.toLocaleString('id')} poin</span>
                  </div>
                )}
                {lastPointsEarned > 0 && (
                  <div className="flex justify-between text-[12px]">
                    <span className="text-[var(--color-muted)]">
                      Poin diperoleh{orderStatus === 'open' ? ' (pending)' : ''}
                    </span>
                    <span className={`tabular-nums font-bold ${orderStatus === 'open' ? 'text-[var(--color-muted)]' : 'text-[var(--color-primary)]'}`}>
                      +{lastPointsEarned.toLocaleString('id')} poin
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-[13px] font-extrabold mt-2 pt-2 border-t border-[var(--color-border)]">
                  <span className="text-[var(--color-text)]">Total poin</span>
                  <span className="tabular-nums text-[var(--color-primary)]">{lastPointsTotal.toLocaleString('id')} poin</span>
                </div>
                {orderStatus === 'open' && (lastSafeRedeem > 0 || lastPointsEarned > 0) && (
                  <p className="text-[10px] text-[var(--color-muted)] mt-1.5 text-center italic">Diperbarui setelah kasir mengonfirmasi</p>
                )}
              </div>
            )}
            <button
              onClick={() => { setSubmitted(false); setCustomerName(customer?.name ?? ''); setRedeemAmt(0); setOrderId(null); setOrderStatus('open'); setActiveTab('menu') }}
              className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white text-[13px] font-bold mb-2"
            >
              🍽️ Pesan Lagi
            </button>
            <button
              onClick={() => { setSubmitted(false); setOrderId(null); setOrderStatus('open'); setActiveTab('riwayat') }}
              className="w-full py-3 rounded-xl border-[1.5px] border-[var(--color-border)] text-[var(--color-muted)] text-[13px] font-semibold hover:text-[var(--color-text)] transition-colors"
            >
              📋 Lihat Riwayat
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

      {/* Tab bar */}
      <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] flex flex-shrink-0">
        {(['menu', 'riwayat'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-1 py-2.5 text-[13px] font-bold relative transition-colors
              ${activeTab === t ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'}`}>
            {t === 'menu' ? '🍽️ Menu' : '📋 Riwayat'}
            {activeTab === t && <span className="absolute bottom-0 left-8 right-8 h-[2px] bg-[var(--color-primary)] rounded-t-sm" />}
          </button>
        ))}
      </div>

      {/* Category bar — full-width bg, content centered */}
      {activeTab === 'menu' && <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] flex-shrink-0">
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
      </div>}

      {/* Menu grid — constrained width on desktop */}
      {activeTab === 'menu' && <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-3 pb-24">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map(item => {
            const cartItem = cart.find(c => c.menuId === item.id)
            const inCart = cartItem && (item.options ?? []).length === 0 ? cartItem.qty : 0
            const habis = isHabis(item)
            return (
              <div key={item.id}
                className={`bg-[var(--color-surface)] border-[1.5px] border-[var(--color-border)] rounded-[12px] overflow-hidden flex flex-col relative
                  ${habis ? 'opacity-60' : ''}`}>
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full aspect-[4/3] object-cover flex-shrink-0" />
                ) : (
                  <div className="w-full aspect-[4/3] bg-[var(--color-surface2)] flex items-center justify-center flex-shrink-0 text-3xl">
                    🍽️
                  </div>
                )}
                {habis && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--color-danger)] text-white">
                    Habis
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
                {habis ? (
                  <div className="w-full py-1.5 rounded-lg text-[12px] font-bold bg-[var(--color-surface2)] text-[var(--color-muted)] text-center border border-[var(--color-border)]">
                    Stok Habis
                  </div>
                ) : inCart > 0 ? (
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
      </div>}

      {/* Riwayat tab */}
      {activeTab === 'riwayat' && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-4 pb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-extrabold text-[var(--color-text)]">Riwayat Pesanan</span>
              <button onClick={fetchHistory} className="text-[11px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
                🔄 Refresh
              </button>
            </div>

            {reorderMsg && (
              <div className="mb-3 px-3 py-2.5 rounded-xl bg-[var(--color-primary-light)] border border-[var(--color-primary)] text-[12px] font-bold text-[var(--color-primary)] text-center">
                {reorderMsg}
              </div>
            )}

            {loadingHistory ? (
              <div className="text-center py-12 text-[var(--color-muted)] text-[13px]">Memuat...</div>
            ) : orderHistory.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">📋</div>
                <p className="text-[14px] font-bold text-[var(--color-text)]">Belum ada riwayat</p>
                <p className="text-[12px] text-[var(--color-muted)] mt-1">Pesananmu akan muncul di sini</p>
              </div>
            ) : (
              orderHistory.map(o => {
                const isActive = o.status === 'open' || o.status === 'paid'
                return (
                  <div key={o.id} className={`bg-[var(--color-surface)] border-[1.5px] rounded-xl mb-3 overflow-hidden
                    ${isActive ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}>
                    {/* Header */}
                    <div className={`px-4 py-3 flex items-center justify-between
                      ${isActive ? 'bg-[var(--color-primary-light)]' : ''}`}>
                      <div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          o.status === 'done' ? 'bg-[var(--color-success-light)] text-[var(--color-success-text)]'
                          : o.status === 'paid' ? 'bg-[var(--color-info-light)] text-[var(--color-info)]'
                          : 'bg-amber-100 text-amber-700'
                        }`}>
                          {o.status === 'done' ? '✅ Selesai' : o.status === 'paid' ? '🍳 Sedang Disiapkan' : '⏳ Menunggu Konfirmasi'}
                        </span>
                        <div className="text-[11px] text-[var(--color-muted)] mt-1">{fmtDateTime(o.created_at)}</div>
                      </div>
                      <div className="text-[15px] font-extrabold tabular-nums text-[var(--color-primary)]">{rp(o.total)}</div>
                    </div>
                    {/* Items */}
                    <div className="px-4 py-2.5 border-t border-[var(--color-border)]">
                      {(o.order_items ?? []).map(i => (
                        <div key={i.id} className="flex justify-between text-[12px] py-0.5">
                          <span className="text-[var(--color-text)]">{i.name} ×{i.qty}</span>
                          <span className="text-[var(--color-muted)] tabular-nums">{rp(i.price * i.qty)}</span>
                        </div>
                      ))}
                    </div>
                    {/* Order ulang (only past orders) */}
                    {!isActive && (
                      <div className="px-4 pb-3 pt-1">
                        <button onClick={() => reorder(o)}
                          className="w-full py-2 rounded-xl border-[1.5px] border-[var(--color-primary)] text-[var(--color-primary)] text-[12px] font-bold hover:bg-[var(--color-primary-light)] transition-colors">
                          🔄 Order Ulang
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

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

            <div className="mb-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-2">
                Jenis Pesanan *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'makan_ditempat', label: 'Makan di Tempat', icon: '🍽️' },
                  { id: 'dibungkus', label: 'Dibungkus', icon: '🥡' },
                ] as const).map(opt => (
                  <button key={opt.id} type="button"
                    onClick={() => { setDiningType(opt.id); setDiningError(false) }}
                    className={`py-2.5 rounded-xl text-[13px] font-bold border-[1.5px] transition-all
                      ${diningType === opt.id
                        ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                        : diningError
                        ? 'border-[var(--color-danger)] text-[var(--color-text)]'
                        : 'border-[var(--color-border)] text-[var(--color-text)]'
                      }`}>
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
              {diningError && <p className="text-[11px] text-[var(--color-danger)] mt-1 font-semibold">Pilih jenis pesanan</p>}
            </div>

            <div className="mb-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1">
                Nama
              </label>
              <input
                value={customerName}
                disabled
                className="w-full px-3 py-2.5 border-[1.5px] rounded-xl text-[13px] bg-transparent text-[var(--color-text)] border-[var(--color-border)] opacity-60 cursor-not-allowed"
              />
            </div>

            {submitError && (
              <p className="text-[12px] text-[var(--color-danger)] font-semibold mb-2 text-center">{submitError}</p>
            )}
            <button onClick={submitOrder} disabled={loading}
              className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white text-[14px] font-bold mb-2 disabled:opacity-50">
              {loading ? 'Mengirim...' : `✅ Kirim Pesanan${safeRedeem > 0 ? ` — ${rp(netTotal)}` : ''}`}
            </button>
            <button onClick={() => { setShowCart(false); setSubmitError('') }}
              className="w-full py-2.5 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-[13px] font-semibold text-[var(--color-muted)]">
              Kembali ke Menu
            </button>
          </div>
        </div>
      )}

    </main>
  )
}

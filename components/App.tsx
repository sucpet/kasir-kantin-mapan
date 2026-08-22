'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Sun, Moon } from 'lucide-react'
import KasirTab from './tabs/KasirTab'
import PesananTab from './tabs/PesananTab'
import MenuTab from './tabs/MenuTab'
import RekapTab from './tabs/RekapTab'
import { useToast } from './Toast'
import { supabase } from '@/lib/supabase'

type Tab = 'kasir' | 'pesanan' | 'menu' | 'rekap'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'kasir',   label: 'Kasir',   icon: '🛒' },
  { id: 'pesanan', label: 'Pesanan', icon: '📋' },
  { id: 'menu',    label: 'Menu',    icon: '🍽️' },
  { id: 'rekap',   label: 'Rekap',   icon: '📊' },
]

export default function App() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('kasir')
  const [openCount, setOpenCount] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [time, setTime] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [isLight, setIsLight] = useState(false)
  const { show: toast, node: toastNode } = useToast()

  useEffect(() => {
    setIsLight(document.documentElement.classList.contains('light'))
  }, [])

  function toggleTheme() {
    const next = !isLight
    setIsLight(next)
    if (next) {
      document.documentElement.classList.add('light')
      localStorage.setItem('theme', 'light')
    } else {
      document.documentElement.classList.remove('light')
      localStorage.setItem('theme', 'dark')
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email ?? '')
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setTime(n.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetchOpenCount()
    const sub = supabase
      .channel('open-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOpenCount)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [])

  async function fetchOpenCount() {
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')
    setOpenCount(count ?? 0)
  }

  function handleOrderCreated() {
    setRefreshKey(k => k + 1)
    fetchOpenCount()
  }

  return (
    <div className="flex flex-col h-full max-w-[1024px] mx-auto bg-[var(--color-bg)]">
      {/* Header */}
      <header className="bg-[var(--color-primary)] text-white px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="text-[10px] font-medium tracking-[0.08em] uppercase opacity-60">Point of Sale</div>
          <div className="text-[16px] font-extrabold tracking-tight">Kasir Kantin Mapan</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-[13px] tabular-nums opacity-70 font-medium">{time}</div>
            <div className="text-[10px] opacity-50 truncate max-w-[140px]">{userEmail}</div>
          </div>
          <button
            onClick={toggleTheme}
            title={isLight ? 'Mode Gelap' : 'Mode Terang'}
            className="flex items-center justify-center w-[30px] h-[30px] rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            {isLight ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <button
            onClick={handleLogout}
            title="Keluar"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-[12px] font-semibold"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="bg-white border-b border-[var(--color-border)] flex flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium relative transition-colors
              ${tab === t.id ? 'text-[var(--color-primary)] font-bold' : 'text-[var(--color-muted)]'}`}
          >
            <span className="text-[18px] leading-none">{t.icon}</span>
            <span>{t.label}</span>
            {tab === t.id && (
              <span className="absolute bottom-0 left-4 right-4 h-[2px] bg-[var(--color-primary)] rounded-t-sm" />
            )}
            {t.id === 'pesanan' && openCount > 0 && (
              <span className="absolute top-1.5 right-[calc(50%-18px)] bg-[var(--color-danger)] text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                {openCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'kasir'   && <KasirTab   onToast={toast} onOrderCreated={handleOrderCreated} />}
        {tab === 'pesanan' && <PesananTab onToast={toast} refreshKey={refreshKey} />}
        {tab === 'menu'    && <MenuTab    onToast={toast} />}
        {tab === 'rekap'   && <RekapTab />}
      </div>

      {toastNode}
    </div>
  )
}

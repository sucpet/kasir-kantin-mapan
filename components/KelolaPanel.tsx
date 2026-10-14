'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import MenuTab from './tabs/MenuTab'
import StokTab from './tabs/StokTab'
import RekapTab from './tabs/RekapTab'
import QRModal from './QRModal'
import SettingsModal from './SettingsModal'

type Sub = 'menu' | 'stok' | 'rekap'

const SUBS: { id: Sub; label: string }[] = [
  { id: 'menu', label: '🍽️ Menu' },
  { id: 'stok', label: '📦 Stok' },
  { id: 'rekap', label: '📊 Rekap' },
]

// Mencegah salah tekan oleh pengguna kasir, bukan pengamanan dari penyerang
async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

interface Props {
  onClose: () => void
  onToast: (msg: string) => void
  isLight: boolean
  onToggleTheme: () => void
  onLogout: () => void
}

export default function KelolaPanel({ onClose, onToast, isLight, onToggleTheme, onLogout }: Props) {
  const [pinHash, setPinHash] = useState<string | null | undefined>(undefined)
  const [unlocked, setUnlocked] = useState(false)
  const [changingPin, setChangingPin] = useState(false)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')
  const [sub, setSub] = useState<Sub>('menu')
  const [showQR, setShowQR] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'admin_pin_hash').maybeSingle()
      .then(({ data }) => setPinHash(data?.value ?? null))
  }, [])

  const creating = pinHash === null || changingPin

  async function submitPin() {
    if (!/^\d{4,6}$/.test(pin)) { setError('PIN harus 4–6 angka'); return }
    if (creating) {
      if (pin !== pin2) { setError('Konfirmasi PIN tidak sama'); return }
      const hash = await sha256(pin)
      const { error: e } = await supabase.from('settings').upsert({ key: 'admin_pin_hash', value: hash })
      if (e) { setError('Gagal menyimpan PIN'); return }
      setPinHash(hash)
      setChangingPin(false)
      onToast('PIN Kelola disimpan')
    } else if ((await sha256(pin)) !== pinHash) {
      setPin('')
      setError('PIN salah')
      return
    }
    setPin('')
    setPin2('')
    setError('')
    setUnlocked(true)
  }

  const pinInput = (value: string, onChange: (v: string) => void, autoFocus = false) => (
    <input
      autoFocus={autoFocus}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      value={value}
      onChange={e => { onChange(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
      onKeyDown={e => e.key === 'Enter' && submitPin()}
      placeholder="••••"
      className="w-full px-4 py-3 mb-3 border-[1.5px] border-[var(--color-border)] rounded-xl text-[length:calc(20px*var(--fs))] tracking-[0.5em] text-center outline-none bg-transparent text-[var(--color-text)] focus:border-[var(--color-primary)]"
    />
  )

  const btn = 'px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-[length:calc(13px*var(--fs))] font-semibold whitespace-nowrap'

  return (
    <div className="fixed inset-0 z-40 bg-[var(--color-bg)] flex justify-center">
      <div className="flex flex-col w-full max-w-[1024px] h-full">
        <header className="bg-[var(--color-primary)] text-white px-4 py-2.5 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="text-[length:calc(16px*var(--fs))] font-extrabold">⚙️ Kelola</div>
          <button onClick={onClose} className={btn}>← Kembali ke Kasir</button>
        </header>

        {!unlocked ? (
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="w-full max-w-xs text-center">
              <div className="text-5xl mb-3">🔒</div>
              {pinHash === undefined ? (
                <p className="text-[var(--color-muted)]">Memuat...</p>
              ) : (
                <>
                  <h2 className="text-[length:calc(18px*var(--fs))] font-extrabold mb-1">{creating ? 'Buat PIN Kelola' : 'Masukkan PIN Kelola'}</h2>
                  <p className="text-[length:calc(12px*var(--fs))] text-[var(--color-muted)] mb-4">
                    {creating ? '4–6 angka. Dipakai untuk membuka Menu, Stok, Rekap, dan Pengaturan.' : 'Untuk mengubah menu, stok, rekap, dan pengaturan.'}
                  </p>
                  {pinInput(pin, setPin, true)}
                  {creating && pinInput(pin2, setPin2)}
                  {error && <p className="text-[length:calc(12px*var(--fs))] text-[var(--color-danger)] font-bold mb-2">{error}</p>}
                  <button onClick={submitPin} disabled={pin.length < 4 || (creating && pin2.length < 4)}
                    className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white text-[length:calc(15px*var(--fs))] font-bold disabled:opacity-40">
                    {creating ? 'Simpan PIN & Buka' : 'Buka'}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="bg-white border-b border-[var(--color-border)] px-3 py-2 flex items-center gap-2 overflow-x-auto scrollbar-hide flex-shrink-0">
              {SUBS.map(s => (
                <button key={s.id} onClick={() => setSub(s.id)}
                  className={`px-4 py-2 rounded-full text-[length:calc(13px*var(--fs))] font-bold whitespace-nowrap border-[1.5px] transition-all
                    ${sub === s.id ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white' : 'border-[var(--color-border)] text-[var(--color-muted)]'}`}>
                  {s.label}
                </button>
              ))}
              <span className="flex-1" />
              {[
                { label: '⚙️ Pengaturan', onClick: () => setShowSettings(true) },
                { label: '📱 QR Pesan', onClick: () => setShowQR(true) },
                { label: isLight ? '🌙 Gelap' : '☀️ Terang', onClick: onToggleTheme },
                { label: '🔑 Ubah PIN', onClick: () => { setChangingPin(true); setUnlocked(false) } },
                { label: '🚪 Keluar', onClick: onLogout },
              ].map(a => (
                <button key={a.label} onClick={a.onClick}
                  className="px-3 py-2 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] text-[length:calc(12px*var(--fs))] font-semibold whitespace-nowrap text-[var(--color-muted)] hover:text-[var(--color-text)]">
                  {a.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              {sub === 'menu' && <MenuTab onToast={onToast} />}
              {sub === 'stok' && <StokTab onToast={onToast} />}
              {sub === 'rekap' && <RekapTab />}
            </div>
          </>
        )}
      </div>

      {showQR && <QRModal onClose={() => setShowQR(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onToast={onToast} />}
    </div>
  )
}

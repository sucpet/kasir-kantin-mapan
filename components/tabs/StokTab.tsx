'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { MenuItem } from '@/lib/types'
import { rp } from '@/lib/utils'

interface Props {
  onToast: (msg: string) => void
}

export default function StokTab({ onToast }: Props) {
  const [items, setItems] = useState<MenuItem[]>([])
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({})
  const [threshEdits, setThreshEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from('menu_items')
      .select('*')
      .order('category')
      .order('name')
    if (data) setItems(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function patchItem(id: string, patch: Partial<MenuItem>) {
    setSaving(prev => ({ ...prev, [id]: true }))
    const { error } = await supabase.from('menu_items').update(patch).eq('id', id)
    if (error) {
      onToast('Gagal menyimpan')
    } else {
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
    }
    setSaving(prev => ({ ...prev, [id]: false }))
  }

  async function toggleTracking(item: MenuItem) {
    const newStock = item.stock === null ? 0 : null
    await patchItem(item.id, { stock: newStock })
    onToast(newStock === null ? `${item.name}: tracking dimatikan` : `${item.name}: tracking aktif (stok = 0)`)
  }

  async function quickAdd(item: MenuItem, delta: number) {
    if (item.stock === null) return
    const newStock = Math.max(0, item.stock + delta)
    await patchItem(item.id, { stock: newStock })
    setStockEdits(prev => { const n = { ...prev }; delete n[item.id]; return n })
  }

  function stockInputVal(item: MenuItem): string {
    if (item.id in stockEdits) return stockEdits[item.id]
    return item.stock !== null ? String(item.stock) : ''
  }

  function threshInputVal(item: MenuItem): string {
    if (item.id in threshEdits) return threshEdits[item.id]
    return String(item.stock_threshold)
  }

  async function commitStock(item: MenuItem) {
    if (!(item.id in stockEdits)) return
    const num = parseInt(stockEdits[item.id])
    if (isNaN(num) || num < 0) {
      setStockEdits(prev => { const n = { ...prev }; delete n[item.id]; return n })
      return
    }
    await patchItem(item.id, { stock: num })
    setStockEdits(prev => { const n = { ...prev }; delete n[item.id]; return n })
    onToast(`${item.name}: stok → ${num}`)
  }

  async function commitThreshold(item: MenuItem) {
    if (!(item.id in threshEdits)) return
    const num = parseInt(threshEdits[item.id])
    if (isNaN(num) || num < 0) {
      setThreshEdits(prev => { const n = { ...prev }; delete n[item.id]; return n })
      return
    }
    await patchItem(item.id, { stock_threshold: num })
    setThreshEdits(prev => { const n = { ...prev }; delete n[item.id]; return n })
  }

  const grouped = items.reduce<Record<string, MenuItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  const trackedItems = items.filter(i => i.stock !== null)
  const habisCount = trackedItems.filter(i => i.stock === 0).length
  const menipisCount = trackedItems.filter(i => i.stock! > 0 && i.stock! <= i.stock_threshold).length

  function StockBadge({ item }: { item: MenuItem }) {
    if (item.stock === null) return <span className="text-[11px] text-[var(--color-muted)]">—</span>
    if (item.stock === 0) return (
      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--color-danger-light)] text-[var(--color-danger)]">Habis</span>
    )
    if (item.stock <= item.stock_threshold) return (
      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">⚠ {item.stock}</span>
    )
    return (
      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--color-success-light)] text-[var(--color-success-text)]">{item.stock}</span>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Summary header */}
      <div className="px-4 py-3 bg-white border-b border-[var(--color-border)] flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-extrabold">📦 Manajemen Stok</span>
          <button onClick={fetchItems} className="text-[11px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
            🔄 Refresh
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {habisCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--color-danger-light)] text-[var(--color-danger)]">
              🔴 {habisCount} Habis
            </span>
          )}
          {menipisCount > 0 && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
              🟡 {menipisCount} Menipis
            </span>
          )}
          {habisCount === 0 && menipisCount === 0 && trackedItems.length > 0 && (
            <span className="text-[12px] text-[var(--color-muted)]">✓ Semua stok aman ({trackedItems.length} item dipantau)</span>
          )}
          {trackedItems.length === 0 && (
            <span className="text-[12px] text-[var(--color-muted)]">Belum ada item yang dipantau stoknya</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="text-center py-8 text-[var(--color-muted)] text-[13px]">Memuat...</div>
        )}

        {!loading && Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat} className="mb-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-muted)] mb-2 px-0.5">{cat}</div>
            {catItems.map(item => (
              <div key={item.id} className={`bg-white border border-[var(--color-border)] rounded-xl mb-2 overflow-hidden ${!item.available ? 'opacity-50' : ''}`}>
                {/* Row 1: name + badge + toggle */}
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold truncate">{item.name}</div>
                    <div className="text-[11px] text-[var(--color-muted)]">{rp(item.price)}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {saving[item.id] ? (
                      <span className="text-[11px] text-[var(--color-muted)]">💾</span>
                    ) : (
                      <StockBadge item={item} />
                    )}
                    <button
                      onClick={() => toggleTracking(item)}
                      disabled={!!saving[item.id]}
                      className={`relative w-10 h-[22px] rounded-full transition-colors flex-shrink-0 overflow-hidden p-0 border-0 disabled:opacity-50
                        ${item.stock !== null ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
                    >
                      <span className={`absolute left-0.5 top-[1px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform
                        ${item.stock !== null ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                {/* Row 2: controls (only if tracking enabled) */}
                {item.stock !== null && (
                  <div className="px-3 pb-2.5 pt-2 border-t border-[var(--color-border)]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => quickAdd(item, -10)}
                        disabled={!!saving[item.id] || item.stock <= 0}
                        className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] disabled:opacity-40 hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors"
                      >−10</button>
                      <button
                        onClick={() => quickAdd(item, -5)}
                        disabled={!!saving[item.id] || item.stock <= 0}
                        className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] disabled:opacity-40 hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] transition-colors"
                      >−5</button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={stockInputVal(item)}
                        onChange={e => setStockEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
                        onBlur={() => commitStock(item)}
                        onKeyDown={e => e.key === 'Enter' && commitStock(item)}
                        className="w-16 text-center px-2 py-1.5 text-[13px] font-extrabold border-[1.5px] border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-primary)] tabular-nums bg-transparent"
                      />
                      <button
                        onClick={() => quickAdd(item, 5)}
                        disabled={!!saving[item.id]}
                        className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] disabled:opacity-40 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
                      >+5</button>
                      <button
                        onClick={() => quickAdd(item, 10)}
                        disabled={!!saving[item.id]}
                        className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] disabled:opacity-40 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
                      >+10</button>
                      <div className="flex items-center gap-1 ml-auto">
                        <span className="text-[10px] text-[var(--color-muted)]">Batas ⚠</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={threshInputVal(item)}
                          onChange={e => setThreshEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
                          onBlur={() => commitThreshold(item)}
                          onKeyDown={e => e.key === 'Enter' && commitThreshold(item)}
                          className="w-12 text-center px-1.5 py-1 text-[11px] font-bold border border-[var(--color-border)] rounded-lg outline-none focus:border-amber-400 tabular-nums bg-transparent"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

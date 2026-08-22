'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { MenuItem, MenuOption } from '@/lib/types'
import { rp } from '@/lib/utils'
import Modal from '@/components/Modal'

interface MenuTabProps {
  onToast: (msg: string) => void
}

type FormOpt = { name: string; choices: string[]; newChoice: string }

export default function MenuTab({ onToast }: MenuTabProps) {
  const [items, setItems] = useState<MenuItem[]>([])
  const [activeCat, setActiveCat] = useState('Semua')
  const [categories, setCategories] = useState<string[]>([])
  const [editorItem, setEditorItem] = useState<MenuItem | null | 'new'>('new')
  const [showEditor, setShowEditor] = useState(false)
  const [form, setForm] = useState({ name: '', price: '', category: '', newCat: '' })
  const [formOpts, setFormOpts] = useState<FormOpt[]>([])
  const [saving, setSaving] = useState(false)

  const fetchItems = useCallback(async () => {
    const { data } = await supabase.from('menu_items').select('*').order('category').order('name')
    if (data) {
      setItems(data)
      setCategories([...new Set(data.map((i: MenuItem) => i.category))])
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  function openNew() {
    setEditorItem('new')
    setForm({ name: '', price: '', category: categories[0] ?? '', newCat: '' })
    setFormOpts([])
    setShowEditor(true)
  }

  function openEdit(item: MenuItem) {
    setEditorItem(item)
    setForm({ name: item.name, price: String(item.price), category: item.category, newCat: '' })
    setFormOpts((item.options ?? []).map(o => ({ ...o, newChoice: '' })))
    setShowEditor(true)
  }

  async function toggleAvail(item: MenuItem) {
    await supabase.from('menu_items').update({ available: !item.available }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, available: !i.available } : i))
  }

  async function deleteItem(id: string) {
    if (!confirm('Hapus item ini?')) return
    await supabase.from('menu_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    onToast('Item dihapus')
  }

  function addOptGroup() {
    setFormOpts(prev => [...prev, { name: '', choices: [], newChoice: '' }])
  }

  function updateGroupName(idx: number, name: string) {
    setFormOpts(prev => prev.map((g, i) => i === idx ? { ...g, name } : g))
  }

  function updateNewChoice(idx: number, val: string) {
    setFormOpts(prev => prev.map((g, i) => i === idx ? { ...g, newChoice: val } : g))
  }

  function addChoice(idx: number) {
    const val = formOpts[idx]?.newChoice.trim()
    if (!val) return
    setFormOpts(prev => prev.map((g, i) => i === idx ? { ...g, choices: [...g.choices, val], newChoice: '' } : g))
  }

  function removeChoice(gIdx: number, cIdx: number) {
    setFormOpts(prev => prev.map((g, i) => i === gIdx ? { ...g, choices: g.choices.filter((_, j) => j !== cIdx) } : g))
  }

  function removeGroup(idx: number) {
    setFormOpts(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveItem() {
    const name = form.name.trim()
    const price = parseInt(form.price)
    const cat = form.category === '__new__' ? form.newCat.trim() : form.category
    if (!name) { onToast('Nama wajib diisi'); return }
    if (!price || price <= 0) { onToast('Harga harus lebih dari 0'); return }
    if (!cat) { onToast('Kategori wajib diisi'); return }

    const options: MenuOption[] = formOpts
      .filter(g => g.name.trim() && g.choices.length > 0)
      .map(g => ({ name: g.name.trim(), choices: g.choices }))

    setSaving(true)
    if (editorItem === 'new' || editorItem === null) {
      const { error } = await supabase.from('menu_items').insert({ name, price, category: cat, available: true, options })
      if (error) { onToast('Gagal menyimpan'); setSaving(false); return }
      onToast('Menu ditambahkan!')
    } else {
      const { error } = await supabase.from('menu_items').update({ name, price, category: cat, options }).eq('id', editorItem.id)
      if (error) { onToast('Gagal menyimpan'); setSaving(false); return }
      onToast('Menu diperbarui!')
    }
    await fetchItems()
    setShowEditor(false)
    setSaving(false)
  }

  const filtered = activeCat === 'Semua' ? items : items.filter(i => i.category === activeCat)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="bg-white border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between flex-shrink-0">
        <span className="text-[14px] font-extrabold">Kelola Menu</span>
        <button onClick={openNew} className="px-3 py-1.5 text-[12px] font-bold bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-mid)] transition-colors">
          + Tambah Item
        </button>
      </div>

      <div className="bg-white border-b border-[var(--color-border)] px-3 py-1.5 flex-shrink-0">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {['Semua', ...categories].map(c => (
            <button key={c} onClick={() => setActiveCat(c)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap flex-shrink-0 border-[1.5px] transition-all
                ${activeCat === c ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white' : 'bg-white border-[var(--color-border)] text-[var(--color-muted)]'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-[var(--color-muted)]">
            <span className="text-4xl">🍽️</span>
            <span className="text-[13px] font-bold text-[#1C2420]">Belum ada menu</span>
            <span className="text-xs">Klik &quot;+ Tambah Item&quot; untuk mulai</span>
          </div>
        )}
        {filtered.map(item => (
          <div key={item.id} className={`bg-white border-[1.5px] border-[var(--color-border)] rounded-[10px] px-3.5 py-2.5 flex items-center gap-3 shadow-[0_1px_2px_rgba(20,35,25,0.08)] transition-opacity ${!item.available ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold">{item.name}</div>
              <div className="text-[11px] text-[var(--color-muted)]">{item.category}
                {(item.options ?? []).length > 0 && (
                  <span className="ml-1.5 text-[10px] bg-[var(--color-primary-light)] text-[var(--color-primary)] px-1.5 py-0.5 rounded-full font-semibold">
                    {(item.options ?? []).map(o => o.name).join(', ')}
                  </span>
                )}
              </div>
            </div>
            <div className="text-[14px] font-extrabold text-[var(--color-primary)] tabular-nums">{rp(item.price)}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleAvail(item)}
                title={item.available ? 'Tersedia' : 'Tidak tersedia'}
                className={`w-[38px] h-[22px] rounded-full relative flex-shrink-0 transition-colors border-none
                  ${item.available ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'}`}
              >
                <span className={`absolute top-[3px] w-[16px] h-[16px] bg-white rounded-full shadow transition-all
                  ${item.available ? 'left-[19px]' : 'left-[3px]'}`} />
              </button>
              <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] text-sm hover:bg-[var(--color-border)] transition-colors">✏️</button>
              <button onClick={() => deleteItem(item.id)} className="p-1.5 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] text-sm hover:bg-[var(--color-danger-light)] transition-colors">🗑️</button>
            </div>
          </div>
        ))}
      </div>

      {showEditor && (
        <Modal onClose={() => setShowEditor(false)}>
          <h2 className="text-[16px] font-extrabold text-center mb-4">
            {editorItem === 'new' ? '➕ Tambah Menu' : '✏️ Edit Menu'}
          </h2>
          <div className="mb-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1">Nama Menu *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="cth: Ayam Goreng"
              className="w-full px-3 py-2 border-[1.5px] border-[var(--color-border)] rounded-lg text-[13px] outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div className="mb-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1">Harga *</label>
            <input type="number" inputMode="numeric" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              placeholder="cth: 15000"
              className="w-full px-3 py-2 border-[1.5px] border-[var(--color-border)] rounded-lg text-[13px] outline-none focus:border-[var(--color-primary)]" />
          </div>
          <div className="mb-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1">Kategori</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-2 border-[1.5px] border-[var(--color-border)] rounded-lg text-[13px] outline-none focus:border-[var(--color-primary)] bg-white cursor-pointer">
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__new__">+ Kategori baru...</option>
            </select>
          </div>
          {form.category === '__new__' && (
            <div className="mb-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1">Nama Kategori Baru</label>
              <input value={form.newCat} onChange={e => setForm(f => ({ ...f, newCat: e.target.value }))}
                placeholder="cth: Dessert"
                className="w-full px-3 py-2 border-[1.5px] border-[var(--color-border)] rounded-lg text-[13px] outline-none focus:border-[var(--color-primary)]" />
            </div>
          )}

          {/* Pilihan / Varian */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Pilihan (opsional)</label>
              <button onClick={addOptGroup} className="text-[11px] font-bold text-[var(--color-primary)] hover:underline">
                + Tambah Pilihan
              </button>
            </div>
            {formOpts.length === 0 && (
              <p className="text-[11px] text-[var(--color-muted)] italic">cth: Potongan → Paha, Dada</p>
            )}
            {formOpts.map((group, gi) => (
              <div key={gi} className="mb-2 p-2.5 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={group.name}
                    onChange={e => updateGroupName(gi, e.target.value)}
                    placeholder="Nama pilihan (cth: Potongan)"
                    className="flex-1 px-2.5 py-1.5 border-[1.5px] border-[var(--color-border)] rounded-lg text-[12px] outline-none focus:border-[var(--color-primary)] bg-white"
                  />
                  <button onClick={() => removeGroup(gi)} className="text-[var(--color-danger)] text-[13px] px-1.5 hover:opacity-70">✕</button>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {group.choices.map((c, ci) => (
                    <span key={ci} className="flex items-center gap-1 px-2 py-0.5 bg-[var(--color-primary-light)] text-[var(--color-primary)] text-[11px] font-semibold rounded-full border border-[var(--color-primary)]/20">
                      {c}
                      <button onClick={() => removeChoice(gi, ci)} className="opacity-60 hover:opacity-100 text-[10px] leading-none">✕</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={group.newChoice}
                    onChange={e => updateNewChoice(gi, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChoice(gi) } }}
                    placeholder="Tambah pilihan..."
                    className="flex-1 px-2.5 py-1.5 border-[1.5px] border-[var(--color-border)] rounded-lg text-[12px] outline-none focus:border-[var(--color-primary)] bg-white"
                  />
                  <button onClick={() => addChoice(gi)} className="px-2.5 py-1.5 text-[12px] font-bold bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-mid)] transition-colors">
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={saveItem} disabled={saving}
            className="w-full py-2.5 rounded-lg text-[13px] font-bold bg-[var(--color-primary)] text-white mb-1.5 disabled:opacity-50 hover:bg-[var(--color-primary-mid)] transition-colors">
            {saving ? 'Menyimpan...' : '💾 Simpan'}
          </button>
          <button onClick={() => setShowEditor(false)}
            className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[#1C2420] transition-colors">
            Batal
          </button>
        </Modal>
      )}
    </div>
  )
}

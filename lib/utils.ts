export function rp(n: number): string {
  return 'Rp ' + Number(n).toLocaleString('id-ID')
}

export function fmtTime(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des']
  const today = todayStr()
  const yesterday = shiftDate(today, -1)
  const label = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
  if (dateStr === today) return `Hari ini — ${label}`
  if (dateStr === yesterday) return `Kemarin — ${label}`
  return label
}

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

export function shiftDate(s: string, n: number): string {
  const d = new Date(s + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

export function dateKey(ts: string): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

function p2(n: number): string {
  return String(n).padStart(2, '0')
}

export function orderSum(items: { price: number; qty: number }[]): number {
  return items.reduce((s, i) => s + i.price * i.qty, 0)
}

type QueueOrder = { status: string; served_at: string | null }

// 'done' = data lama (lunas + disajikan)
export function inQueue(o: QueueOrder): boolean {
  return o.status !== 'done' && (o.status === 'open' || !o.served_at)
}

export function isServed(o: QueueOrder): boolean {
  return o.status === 'done' || !!o.served_at
}

// Kode unik (points_to_earn) hanya untuk mencocokkan QRIS pesanan mandiri; tunai cukup total
export function qrisAmount(o: { total: number; points_to_earn: number; source: string }): number {
  return o.source === 'customer' ? o.total + o.points_to_earn : o.total
}

// Negatif = uang kurang
export function kembalian(due: number, received: number): number {
  return received - due
}

export type CustomerStage = 'issue' | 'waiting' | 'cooking' | 'ready'

// Tahap pesanan dari sisi pelanggan /order
export function customerStage(o: QueueOrder & { payment_issue_at?: string | null }): CustomerStage {
  if (isServed(o)) return 'ready'
  if (o.status === 'open') return o.payment_issue_at ? 'issue' : 'waiting'
  return 'cooking'
}

type OptGroup = { name: string; choices: string[]; prices?: Record<string, number>; multi?: boolean }
export type Picked = Record<string, string[]>

export function togglePick(picked: Picked, g: OptGroup, choice: string): Picked {
  const cur = picked[g.name] ?? []
  const next = !g.multi ? [choice] : cur.includes(choice) ? cur.filter(c => c !== choice) : [...cur, choice]
  return { ...picked, [g.name]: next }
}

export function pickedComplete(groups: OptGroup[], picked: Picked): boolean {
  return groups.every(g => g.multi || (picked[g.name]?.length ?? 0) > 0)
}

// Item keranjang dari pilihan: label "Nasi Goreng (Pedas, + Telur)" dan harga + tambahan.
export function pickedLine(base: { name: string; price: number }, groups: OptGroup[], picked: Picked) {
  const chosen = groups.flatMap(g => g.choices.filter(c => picked[g.name]?.includes(c)).map(c => ({ g: g.name, c, p: g.prices?.[c] ?? 0 })))
  const label = chosen.map(x => x.c).join(', ')
  return {
    name: label ? `${base.name} (${label})` : base.name,
    price: base.price + chosen.reduce((s, x) => s + x.p, 0),
    opts: chosen.map(({ g, c }) => ({ g, c })),
    key: label,
  }
}

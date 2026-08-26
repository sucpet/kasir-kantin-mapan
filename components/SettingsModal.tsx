'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/Modal'
import { isConnected, getDeviceName, connectPrinter, disconnectPrinter, onDisconnect, isMockMode } from '@/lib/printer'

interface Props {
  onClose: () => void
  onToast: (msg: string) => void
}

export default function SettingsModal({ onClose, onToast }: Props) {
  const [qrisPreview, setQrisPreview] = useState('')
  const [qrisFile, setQrisFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [autoPrint, setAutoPrint] = useState(false)
  const [printerName, setPrinterName] = useState<string | null>(null)
  const [printerConnecting, setPrinterConnecting] = useState(false)
  const [mockPrinter, setMockPrinter] = useState(false)

  useEffect(() => {
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'qris_image_url')
      .maybeSingle()
      .then(({ data }) => { if (data?.value) setQrisPreview(data.value) })
    setAutoPrint(localStorage.getItem('auto_print') === 'true')
    const mock = isMockMode()
    setMockPrinter(mock)
    if (isConnected()) setPrinterName(getDeviceName())
    onDisconnect(() => { if (!isMockMode()) setPrinterName(null) })
  }, [])

  function toggleMockPrinter() {
    const next = !mockPrinter
    setMockPrinter(next)
    localStorage.setItem('printer_mock', String(next))
    setPrinterName(next ? 'Mock Printer (Test)' : (isConnected() ? getDeviceName() : null))
    onToast(next ? '🖨️ Mode mock printer aktif' : 'Mode mock printer dimatikan')
  }

  async function handleConnectPrinter() {
    setPrinterConnecting(true)
    try {
      const name = await connectPrinter()
      setPrinterName(name)
      onToast(`Printer "${name}" terhubung 🖨️`)
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Gagal menghubungkan printer')
    } finally {
      setPrinterConnecting(false)
    }
  }

  function handleDisconnectPrinter() {
    disconnectPrinter()
    setPrinterName(null)
    onToast('Printer diputus')
  }

  function toggleAutoPrint() {
    const next = !autoPrint
    setAutoPrint(next)
    localStorage.setItem('auto_print', String(next))
    onToast(next ? 'Auto Print diaktifkan 🖨️' : 'Auto Print dimatikan')
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setQrisFile(file)
    setQrisPreview(URL.createObjectURL(file))
  }

  async function save() {
    if (!qrisFile) { onClose(); return }
    setSaving(true)
    const ext = qrisFile.name.split('.').pop() ?? 'png'
    const path = `public/qris-${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from('menu-images')
      .upload(path, qrisFile, { contentType: qrisFile.type })
    if (error) { onToast('Gagal upload QRIS'); setSaving(false); return }
    const url = supabase.storage.from('menu-images').getPublicUrl(path).data.publicUrl
    await supabase.from('settings').upsert({ key: 'qris_image_url', value: url })
    onToast('QRIS berhasil disimpan!')
    setSaving(false)
    onClose()
  }

  async function removeQris() {
    await supabase.from('settings').upsert({ key: 'qris_image_url', value: null })
    setQrisPreview('')
    setQrisFile(null)
    onToast('QRIS dihapus')
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-[16px] font-extrabold text-center mb-1">⚙️ Pengaturan</h2>
      <p className="text-[12px] text-[var(--color-muted)] text-center mb-4">
        Jika QRIS diset, pelanggan langsung diarahkan bayar setelah pesan
      </p>

      <div className="mb-4">
        <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-2">
          Kode QRIS Toko
        </label>
        {qrisPreview ? (
          <div className="relative">
            <div className="bg-white rounded-xl p-3 border border-[var(--color-border)]">
              <img src={qrisPreview} alt="QRIS" className="w-full max-h-52 object-contain mx-auto block" />
            </div>
            <div className="flex gap-2 mt-2">
              <label className="flex-1 py-2 text-[12px] font-bold text-center bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg cursor-pointer hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors">
                🔄 Ganti Foto
                <input type="file" accept="image/*" className="hidden" onChange={handlePick} />
              </label>
              <button onClick={removeQris}
                className="px-3 py-2 text-[12px] font-bold bg-[var(--color-danger-light)] border border-[var(--color-danger-light)] text-[var(--color-danger)] rounded-lg hover:opacity-80 transition-opacity">
                Hapus
              </button>
            </div>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center w-full h-36 border-[1.5px] border-dashed border-[var(--color-border)] rounded-xl cursor-pointer hover:border-[var(--color-primary)] transition-colors bg-[var(--color-surface2)]">
            <span className="text-3xl mb-2">📱</span>
            <span className="text-[12px] text-[var(--color-text)] font-semibold">Upload gambar QRIS toko</span>
            <span className="text-[10px] text-[var(--color-muted)] mt-1 text-center px-4">
              Pelanggan akan diminta scan ini setelah memesan
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={handlePick} />
          </label>
        )}
      </div>

      {/* Bluetooth Thermal Printer */}
      <div className="mb-4 p-3.5 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl">
        <div className="text-[13px] font-bold mb-1">📡 Printer Bluetooth (BLE)</div>
        <div className="text-[11px] text-[var(--color-muted)] mb-3">
          Sambungkan thermal printer BLE untuk cetak struk langsung tanpa dialog print.
        </div>

        {/* Status printer */}
        {printerName ? (
          <div className="flex items-center gap-2 mb-3">
            <div className={`flex-1 rounded-lg px-3 py-2 border ${mockPrinter ? 'bg-[var(--color-info-light)] border-[var(--color-info)]' : 'bg-[var(--color-success-light)] border-[var(--color-success)]'}`}>
              <div className={`text-[11px] font-bold ${mockPrinter ? 'text-[var(--color-info)]' : 'text-[var(--color-success-text)]'}`}>
                {mockPrinter ? '🧪 Mode Test' : '✓ Terhubung'}
              </div>
              <div className="text-[12px] font-semibold text-[var(--color-text)] truncate">{printerName}</div>
            </div>
            {!mockPrinter && (
              <button onClick={handleDisconnectPrinter}
                className="px-3 py-2 text-[12px] font-bold bg-[var(--color-danger-light)] border border-[var(--color-danger-light)] text-[var(--color-danger)] rounded-lg hover:opacity-80 transition-opacity">
                Putus
              </button>
            )}
          </div>
        ) : (
          <button onClick={handleConnectPrinter} disabled={printerConnecting}
            className="w-full py-2.5 rounded-lg text-[12px] font-bold border-[1.5px] border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] disabled:opacity-50 transition-colors mb-3">
            {printerConnecting ? 'Mencari printer...' : '🔍 Cari & Hubungkan Printer'}
          </button>
        )}

        {/* Mock toggle */}
        <div className="flex items-center justify-between pt-2.5 border-t border-[var(--color-border)]">
          <div>
            <div className="text-[12px] font-bold">🧪 Mode Test (tanpa printer)</div>
            <div className="text-[10px] text-[var(--color-muted)] mt-0.5">Simulasi print untuk cek flow</div>
          </div>
          <button
            onClick={toggleMockPrinter}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${mockPrinter ? 'bg-[var(--color-info)]' : 'bg-[var(--color-border)]'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${mockPrinter ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {/* Auto Print toggle */}
      <div className="mb-4 p-3.5 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-bold">🖨️ Auto Print Struk</div>
            <div className="text-[11px] text-[var(--color-muted)] mt-0.5">
              {printerName ? 'Print otomatis via Bluetooth saat konfirmasi' : 'Aktifkan hanya di perangkat yang terhubung printer'}
            </div>
          </div>
          <button
            onClick={toggleAutoPrint}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${autoPrint ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoPrint ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      <button onClick={save} disabled={saving || !qrisFile}
        className="w-full py-2.5 rounded-lg text-[13px] font-bold bg-[var(--color-primary)] text-white mb-1.5 disabled:opacity-50 hover:bg-[var(--color-primary-mid)] transition-colors">
        {saving ? 'Menyimpan...' : '💾 Simpan'}
      </button>
      <button onClick={onClose}
        className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-[var(--color-surface2)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
        Tutup
      </button>
    </Modal>
  )
}

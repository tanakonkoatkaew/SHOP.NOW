import { useState } from 'react'

export const EMPTY_ADDRESS = {
  label: '', recipient: '', phone: '', address: '',
  subdistrict: '', district: '', province: '', postal_code: '',
}

/** Format an address object into a single Thai-style line. */
export function formatAddress(a) {
  if (!a) return ''
  return [
    a.address,
    a.subdistrict && `ต.${a.subdistrict}`,
    a.district && `อ.${a.district}`,
    a.province && `จ.${a.province}`,
    a.postal_code,
  ].filter(Boolean).join(' ')
}

const input = 'w-full text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400 focus:bg-white transition-colors'

export default function AddressForm({ initial = EMPTY_ADDRESS, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...EMPTY_ADDRESS, ...initial })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.recipient.trim()) return setError('กรุณากรอกชื่อผู้รับ')
    if (!form.address.trim()) return setError('กรุณากรอกที่อยู่')
    if (!form.province.trim()) return setError('กรุณากรอกจังหวัด')
    if (!/^\d{5}$/.test(form.postal_code)) return setError('รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก')
    setError('')
    onSave(form)
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-400 mb-1">ชื่อเรียก (เช่น บ้าน, ที่ทำงาน)</p>
          <input value={form.label} onChange={e => set('label', e.target.value)} placeholder="บ้าน" className={input} />
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">ชื่อผู้รับ *</p>
          <input value={form.recipient} onChange={e => set('recipient', e.target.value)} placeholder="ชื่อ-นามสกุล" className={input} />
        </div>
      </div>

      <div>
        <p className="text-xs text-slate-400 mb-1">เบอร์โทรศัพท์</p>
        <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="08x-xxx-xxxx" className={input} />
      </div>

      <div>
        <p className="text-xs text-slate-400 mb-1">ที่อยู่ (บ้านเลขที่ / หมู่ / ถนน) *</p>
        <textarea rows={2} value={form.address} onChange={e => set('address', e.target.value)}
          placeholder="เช่น 99/1 หมู่ 5 ถ.สุขุมวิท" className={`${input} resize-none`} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-400 mb-1">ตำบล / แขวง</p>
          <input value={form.subdistrict} onChange={e => set('subdistrict', e.target.value)} className={input} />
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">อำเภอ / เขต</p>
          <input value={form.district} onChange={e => set('district', e.target.value)} className={input} />
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">จังหวัด *</p>
          <input value={form.province} onChange={e => set('province', e.target.value)} className={input} />
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">รหัสไปรษณีย์ *</p>
          <input value={form.postal_code} inputMode="numeric" maxLength={5}
            onChange={e => set('postal_code', e.target.value.replace(/\D/g, ''))}
            placeholder="5 หลัก" className={`${input} font-mono`} />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onCancel} disabled={saving}
          className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:border-slate-800 transition-colors">
          ยกเลิก
        </button>
        <button onClick={submit} disabled={saving}
          className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
          {saving ? 'กำลังบันทึก...' : 'บันทึกที่อยู่'}
        </button>
      </div>
    </div>
  )
}

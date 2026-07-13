import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, FileImage, Package, Users, Gift,
  CheckCircle, XCircle, Pencil, Trash2, Plus,
  X, AlertTriangle, RefreshCw, Upload,
  MessageCircle, Send, Bot, ShieldCheck,
  Truck, Star, ShoppingBag, Clock, Box, Check, Zap, MapPin,
} from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import Spinner from '../components/Spinner'

// ─── helpers ─────────────────────────────────────────────────────────────────

const CATES = ['game', 'software', 'topup', 'other']

const STATUS_BADGE = {
  pending: { label: 'รอสลิป', cls: 'bg-gray-100 text-gray-600' },
  pending_review: { label: 'รอตรวจสอบ', cls: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'อนุมัติแล้ว', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'ปฏิเสธ', cls: 'bg-red-100 text-red-600' },
}

function Badge({ status }) {
  const s = STATUS_BADGE[status] || { label: status, cls: 'bg-gray-100 text-gray-500' }
  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>
}

function StatCard({ label, value, icon: Icon, sub }) {
  return (
    <div className="bg-white border-2 border-gray-100 rounded-2xl p-6 flex items-start gap-4">
      <div className="w-12 h-12 bg-[#F2F0F1] rounded-xl flex items-center justify-center shrink-0">
        <Icon size={22} className="text-black" />
      </div>
      <div>
        <p className="text-3xl font-black text-black">{value ?? '—'}</p>
        <p className="text-sm font-semibold text-black mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function Modal({ open, title, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-black text-black">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </motion.div>
    </div>
  )
}

// ─── ANALYTICS CHARTS ────────────────────────────────────────────────────────

const CAT_COLORS = ['#000000', '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6']

function RevenueChart({ data }) {
  const max = Math.max(1, ...data.map(d => d.revenue))
  const totalPeriod = data.reduce((s, d) => s + d.revenue, 0)
  return (
    <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-black flex items-center gap-2"><LayoutDashboard size={18} /> รายได้ 14 วันล่าสุด</h3>
        <span className="text-sm font-bold text-gray-500">{totalPeriod.toLocaleString()} ฿</span>
      </div>
      {totalPeriod === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">ยังไม่มีรายได้ในช่วงนี้</p>
      ) : (
        <div className="flex items-end gap-1.5 h-40">
          {data.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div className="w-full bg-[#F2F0F1] rounded-t-md relative flex items-end" style={{ height: '100%' }}>
                <div className="w-full bg-black rounded-t-md hover:bg-amber-500 transition-colors" style={{ height: `${(d.revenue / max) * 100}%` }} />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                  {d.revenue.toLocaleString()} ฿
                </div>
              </div>
              <span className="text-[9px] text-gray-400">{d.date.slice(8)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CategorySplit({ data }) {
  const total = data.reduce((s, d) => s + d.revenue, 0)
  return (
    <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
      <h3 className="text-lg font-black flex items-center gap-2 mb-4"><Package size={18} /> ยอดขายตามหมวด</h3>
      {total === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">ยังไม่มีข้อมูล</p>
      ) : (
        <div className="space-y-3">
          {data.map((d, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1 text-sm">
                <span className="font-semibold uppercase">{d.cate}</span>
                <span className="text-gray-500 text-xs">{d.revenue.toLocaleString()} ฿ · {d.qty} ชิ้น</span>
              </div>
              <div className="h-2.5 bg-[#F2F0F1] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(d.revenue / total) * 100}%`, background: CAT_COLORS[i % CAT_COLORS.length] }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── TAB: DASHBOARD ──────────────────────────────────────────────────────────

function Dashboard() {
  const [stats, setStats] = useState(null)
  const load = useCallback(() => api.admin.stats().then(({ data }) => setStats(data)), [])
  useEffect(() => { load() }, [load])

  if (!stats) return <Spinner />
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-tight">ภาพรวม</h2>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors">
          <RefreshCw size={14} /> รีเฟรช
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="ผู้ใช้ทั้งหมด" value={stats.users} icon={Users} />
        <StatCard label="สินค้า" value={stats.products} icon={Package} />
        <StatCard label="รอจัดส่ง" value={stats.pending_orders ?? 0} icon={Truck} sub="ยังไม่สำเร็จ" />
        <StatCard label="รายได้รวม" value={`${(stats.total_revenue || 0).toLocaleString()} ฿`} icon={CheckCircle} />
        <StatCard label="แต้มสะสมคงค้าง" value={(stats.points_outstanding ?? 0).toLocaleString()} icon={Star} sub="ทั้งระบบ" />
      </div>

      {/* Revenue chart + category split */}
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
        <RevenueChart data={stats.revenue_by_day || []} />
        <CategorySplit data={stats.sales_by_category || []} />
      </div>

      {/* Best sellers */}
      <div className="bg-white border-2 border-gray-100 rounded-2xl p-6">
        <h3 className="text-lg font-black flex items-center gap-2 mb-4"><Package size={18} /> สินค้าขายดี</h3>
        {(!stats.top_products || stats.top_products.length === 0) ? (
          <p className="text-sm text-gray-400 py-4 text-center">ยังไม่มีข้อมูลการขาย</p>
        ) : (
          <div className="space-y-2">
            {stats.top_products.map((p, i) => {
              const max = stats.top_products[0].qty || 1
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-6 text-sm font-black text-gray-400">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold truncate">{p.name}</span>
                      <span className="text-xs text-gray-500 shrink-0 ml-2">{p.qty} ชิ้น · {p.orders} ออเดอร์</span>
                    </div>
                    <div className="h-2 bg-[#F2F0F1] rounded-full overflow-hidden">
                      <div className="h-full bg-black rounded-full" style={{ width: `${Math.max(6, (p.qty / max) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TAB: COUPON MANAGEMENT ──────────────────────────────────────────────────

function CouponManagement() {
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ code: '', discount: '', msg: '', max_uses: '' })
  const [toast, setToast] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.admin.coupons().then(({ data }) => {
      setCoupons(data.results || [])
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const create = async (e) => {
    e.preventDefault()
    const { ok, data } = await api.admin.createCoupon({
      code: form.code, discount: parseFloat(form.discount), msg: form.msg,
      max_uses: form.max_uses === '' ? 0 : parseInt(form.max_uses, 10),
    })
    if (ok && data.status) { showToast('สร้างคูปองสำเร็จ'); setForm({ code: '', discount: '', msg: '', max_uses: '' }); load() }
    else showToast(data.message || 'เกิดข้อผิดพลาด')
  }

  const toggle = async (c) => {
    const { ok, data } = await api.admin.updateCoupon(c.id, { active: !c.active })
    if (ok && data.status) { showToast(c.active ? 'ปิดคูปองแล้ว' : 'เปิดคูปองแล้ว'); load() }
    else showToast(data.message || 'เกิดข้อผิดพลาด')
  }

  const remove = async (id) => {
    if (!confirm('ยืนยันลบคูปองนี้?')) return
    const { ok, data } = await api.admin.deleteCoupon(id)
    if (ok && data.status) { showToast('ลบคูปองแล้ว'); load() }
    else showToast(data.message || 'เกิดข้อผิดพลาด')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-tight">คูปองส่วนลด</h2>
        <button onClick={load} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><RefreshCw size={14} /></button>
      </div>

      {toast && <div className="px-4 py-3 bg-black text-white text-sm font-semibold rounded-xl">{toast}</div>}

      {/* Create form */}
      <form onSubmit={create} className="bg-white border-2 border-gray-100 rounded-2xl p-5 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[130px]">
          <label className="block text-xs font-bold text-gray-500 mb-1">โค้ด</label>
          <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
            placeholder="SAVE20" required
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm uppercase focus:border-black outline-none" />
        </div>
        <div className="w-24">
          <label className="block text-xs font-bold text-gray-500 mb-1">ส่วนลด (%)</label>
          <input type="number" min="1" max="100" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
            placeholder="20" required
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-black outline-none" />
        </div>
        <div className="w-28">
          <label className="block text-xs font-bold text-gray-500 mb-1">จำกัดครั้ง</label>
          <input type="number" min="0" value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
            placeholder="0 = ไม่จำกัด"
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-black outline-none" />
        </div>
        <div className="flex-1 min-w-[130px]">
          <label className="block text-xs font-bold text-gray-500 mb-1">คำอธิบาย (ไม่บังคับ)</label>
          <input value={form.msg} onChange={e => setForm(f => ({ ...f, msg: e.target.value }))}
            placeholder="ส่วนลดพิเศษ"
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-black outline-none" />
        </div>
        <button type="submit" className="flex items-center gap-1.5 px-5 py-2 bg-black text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors">
          <Plus size={15} /> สร้าง
        </button>
      </form>

      <div className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden">
        {loading ? <div className="py-16"><Spinner /></div> : coupons.length === 0 ? (
          <div className="text-center py-20 text-gray-400 font-medium">ยังไม่มีคูปอง</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#F2F0F1]">
                <tr>
                  {['โค้ด', 'ส่วนลด', 'คำอธิบาย', 'ใช้ไป', 'สถานะ', 'จัดการ'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-black uppercase tracking-wide text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coupons.map(c => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono font-bold">{c.code}</td>
                    <td className="px-4 py-3 text-sm font-bold">{c.discount}%</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c.msg}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {c.used_count}{c.max_uses > 0 ? ` / ${c.max_uses}` : ' / ∞'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${c.usable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {c.usable ? 'พร้อมใช้' : c.active ? 'สิทธิ์หมด' : 'ปิดอยู่'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => toggle(c)}
                          className={`px-3 py-1.5 border-2 text-xs font-bold rounded-full transition-colors ${c.active ? 'border-gray-300 text-gray-600 hover:border-black' : 'border-green-300 text-green-600 hover:border-green-500'}`}>
                          {c.active ? 'ปิด' : 'เปิด'}
                        </button>
                        <button onClick={() => remove(c.id)}
                          className="flex items-center gap-1 px-3 py-1.5 border-2 border-red-200 text-red-500 text-xs font-bold rounded-full hover:border-red-400 transition-colors">
                          <Trash2 size={12} /> ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TAB: PRODUCT MANAGEMENT ─────────────────────────────────────────────────

const EMPTY_PRODUCT = { name: '', price: '', image: '', cate: 'game', stock: 0, warranty: false, description: '', sale_price: '', sale_start: '', sale_end: '', delivery_type: 'digital' }

// datetime-local wants "YYYY-MM-DDTHH:MM"; backend sends ISO with offset
const toLocalInput = (iso) => (iso ? String(iso).slice(0, 16) : '')

function ProductForm({ initial = EMPTY_PRODUCT, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    ...initial,
    sale_price: initial.sale_price || '',
    sale_start: toLocalInput(initial.sale_start),
    sale_end: toLocalInput(initial.sale_end),
    delivery_type: initial.delivery_type || 'digital',
  })
  const [imgFile, setImgFile] = useState(null)
  const [preview, setPreview] = useState(initial.image || '')
  const [imgTab, setImgTab] = useState('url') // 'url' | 'upload'
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImgFile(file)
    setPreview(URL.createObjectURL(file))
    set('image', '')
  }

  const clearFile = () => {
    setImgFile(null)
    setPreview(form.image || '')
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-black uppercase mb-1">ชื่อสินค้า *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm transition-colors" />
        </div>
        <div>
          <label className="block text-xs font-black uppercase mb-1">ราคา (฿) *</label>
          <input type="number" value={form.price} onChange={e => set('price', e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm transition-colors" />
        </div>
        <div>
          <label className="block text-xs font-black uppercase mb-1">Stock</label>
          <input type="number" value={form.stock} onChange={e => set('stock', e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm transition-colors" />
        </div>
        <div>
          <label className="block text-xs font-black uppercase mb-1">หมวดหมู่</label>
          <select value={form.cate} onChange={e => set('cate', e.target.value)}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm bg-white transition-colors">
            {CATES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 pt-5">
          <input type="checkbox" id="warranty" checked={form.warranty} onChange={e => set('warranty', e.target.checked)}
            className="w-4 h-4 accent-black" />
          <label htmlFor="warranty" className="text-sm font-semibold">มีการรับประกัน</label>
        </div>

        {/* Delivery type */}
        <div className="col-span-2">
          <label className="block text-xs font-black uppercase mb-1">รูปแบบการจัดส่ง</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: 'digital', icon: Zap, title: 'ดิจิทัล (ส่งออนไลน์)', sub: 'ส่งคีย์/รหัสทันที ไม่ต้องใช้ที่อยู่' },
              { v: 'physical', icon: Truck, title: 'จัดส่งพัสดุ', sub: 'ลูกค้าต้องระบุที่อยู่จัดส่ง' },
            ].map(({ v, icon: Icon, title, sub }) => (
              <button key={v} type="button" onClick={() => set('delivery_type', v)}
                className={`flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                  form.delivery_type === v ? 'border-black bg-[#F2F0F1]' : 'border-gray-200 hover:border-gray-400'
                }`}>
                <Icon size={16} className="shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold leading-tight">{title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Image section */}
        <div className="col-span-2 space-y-2">
          <label className="block text-xs font-black uppercase mb-1">รูปภาพสินค้า</label>

          {/* Tab toggle */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
            {[['url', 'URL ลิงก์'], ['upload', 'อัพโหลดไฟล์']].map(([v, l]) => (
              <button key={v} type="button"
                onClick={() => { setImgTab(v); if (v === 'url') clearFile() }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${imgTab === v ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-black'}`}>
                {l}
              </button>
            ))}
          </div>

          {imgTab === 'url' ? (
            <input
              value={form.image}
              onChange={e => { set('image', e.target.value); setPreview(e.target.value) }}
              placeholder="https://example.com/image.jpg"
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm transition-colors"
            />
          ) : (
            <div>
              {imgFile ? (
                <div className="flex items-center gap-3 p-3 border-2 border-black rounded-xl bg-[#F2F0F1]">
                  <img src={preview} alt="" className="w-12 h-12 object-contain rounded-lg bg-white" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{imgFile.name}</p>
                    <p className="text-xs text-gray-500">{(imgFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button type="button" onClick={clearFile} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                    <X size={14} className="text-gray-600" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 p-5 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-black hover:bg-[#F2F0F1] transition-all text-gray-400 hover:text-black">
                  <Upload size={22} />
                  <div className="text-center">
                    <p className="text-sm font-semibold">คลิกเพื่อเลือกรูปภาพ</p>
                    <p className="text-xs mt-0.5">PNG, JPG, WEBP ขนาดไม่เกิน 5MB</p>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
                </label>
              )}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="flex items-center gap-3 mt-2">
              <img src={preview} alt="preview" className="w-16 h-16 object-contain rounded-xl border border-gray-200 bg-[#F2F0F1] p-1"
                onError={e => { e.target.style.display = 'none' }} />
              <p className="text-xs text-gray-400">ตัวอย่างรูป</p>
            </div>
          )}
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-black uppercase mb-1">คำอธิบาย</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm resize-none transition-colors" />
        </div>

        {/* Flash sale */}
        <div className="col-span-2 border-2 border-dashed border-amber-200 bg-amber-50/40 rounded-xl p-4 space-y-3">
          <p className="text-xs font-black uppercase text-amber-600 flex items-center gap-1.5"><Star size={13} /> Flash Sale (ไม่บังคับ)</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-gray-500 mb-1">ราคาลด (฿) — เว้นว่าง = ไม่ลด</label>
              <input type="number" min="0" value={form.sale_price} onChange={e => set('sale_price', e.target.value)}
                placeholder="เช่น 199"
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-amber-400 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1">เริ่มลด</label>
              <input type="datetime-local" value={form.sale_start} onChange={e => set('sale_start', e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-amber-400 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-500 mb-1">สิ้นสุด</label>
              <input type="datetime-local" value={form.sale_end} onChange={e => set('sale_end', e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-amber-400 outline-none" />
            </div>
          </div>
          <p className="text-[11px] text-gray-400">เว้นวันเวลา = ลดทันทีและไม่มีกำหนดหมด · ราคาลดต้องต่ำกว่าราคาปกติ</p>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onCancel} className="px-5 py-2 border-2 border-gray-200 rounded-full text-sm font-semibold hover:border-black transition-colors">ยกเลิก</button>
        <button onClick={() => onSave(form, imgFile)} disabled={saving || !form.name || !form.price}
          className="px-5 py-2 bg-black text-white rounded-full text-sm font-bold hover:bg-gray-800 disabled:opacity-40 transition-colors">
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </div>
  )
}

function ProductManagement() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'create' | product
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.admin.products().then(({ data }) => {
      setProducts(data.results || [])
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleSave = async (form, imgFile) => {
    setSaving(true)
    let productData = { ...form }

    if (imgFile) {
      const uploadRes = await api.admin.uploadProductImage(imgFile)
      if (!uploadRes.status) {
        setSaving(false)
        showToast(uploadRes.message || 'อัพโหลดรูปไม่สำเร็จ')
        return
      }
      productData.image = uploadRes.url
    }

    let res
    if (modal === 'create') res = await api.admin.createProduct(productData)
    else res = await api.admin.updateProduct(modal.id, productData)
    setSaving(false)
    if (res.ok) { showToast(res.data.message); setModal(null); load() }
    else showToast(res.data.message || 'เกิดข้อผิดพลาด')
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`ลบ "${name}"?`)) return
    const { ok, data } = await api.admin.deleteProduct(id)
    if (ok) { showToast('ลบสินค้าสำเร็จ'); load() }
    else showToast(data.message || 'เกิดข้อผิดพลาด')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-tight">จัดการสินค้า</h2>
        <button onClick={() => setModal('create')}
          className="flex items-center gap-2 px-5 py-2 bg-black text-white text-sm font-bold rounded-full hover:bg-gray-800 transition-colors">
          <Plus size={16} /> เพิ่มสินค้า
        </button>
      </div>

      {toast && <div className="px-4 py-3 bg-black text-white text-sm font-semibold rounded-xl">{toast}</div>}

      <div className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden">
        {loading ? <div className="py-16"><Spinner /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#F2F0F1]">
                <tr>
                  {['รูป', 'ชื่อสินค้า', 'ราคา', 'Stock', 'หมวด', 'จัดส่ง', 'จัดการ'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-black uppercase tracking-wide text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <img src={p.image} alt="" className="w-10 h-10 object-contain rounded-lg bg-[#F2F0F1] p-1"
                        onError={e => { e.target.style.display = 'none' }} />
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold max-w-[200px] truncate">{p.name}</td>
                    <td className="px-4 py-3 text-sm font-bold">{p.price?.toLocaleString()} ฿</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`font-bold ${p.stock === 0 ? 'text-red-500' : p.stock < 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {p.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 uppercase">{p.cate}</td>
                    <td className="px-4 py-3">
                      {p.delivery_type === 'physical' ? (
                        <span className="flex items-center gap-1 w-fit text-[10px] font-bold px-2 py-1 bg-amber-100 text-amber-700 rounded-full whitespace-nowrap">
                          <Truck size={10} /> พัสดุ
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 w-fit text-[10px] font-bold px-2 py-1 bg-sky-100 text-sky-700 rounded-full whitespace-nowrap">
                          <Zap size={10} /> ออนไลน์
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => setModal(p)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-black">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(p.id, p.name)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {modal && (
          <Modal
            open
            title={modal === 'create' ? 'เพิ่มสินค้าใหม่' : `แก้ไข: ${modal.name}`}
            onClose={() => setModal(null)}
          >
            <ProductForm
              initial={modal === 'create' ? EMPTY_PRODUCT : modal}
              onSave={handleSave}
              onCancel={() => setModal(null)}
              saving={saving}
            />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── TAB: USER MANAGEMENT ────────────────────────────────────────────────────

function UserManagement() {
  const { user: me, refreshUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [viewingOrders, setViewingOrders] = useState(null)
  const [userOrders, setUserOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  const openOrders = async (u) => {
    setViewingOrders(u)
    setOrdersLoading(true)
    setUserOrders([])
    try {
      const { ok, data } = await api.admin.userOrders(u.id)
      if (ok) {
        setUserOrders(data.results || [])
      } else {
        showToast(data.message || 'ดึงประวัติสั่งซื้อไม่สำเร็จ')
      }
    } catch (err) {
      console.error(err)
      showToast('เกิดข้อผิดพลาดในการดึงข้อมูล')
    } finally {
      setOrdersLoading(false)
    }
  }

  const load = useCallback(() => {
    setLoading(true)
    api.admin.users().then(({ data }) => {
      setUsers(data.results || [])
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const openEdit = (u) => { setEditing(u); setEditForm({ credit: u.credit, reward: u.reward, is_admin: u.is_admin }) }

  const handleSave = async () => {
    setSaving(true)
    const { ok, data } = await api.admin.updateUser(editing.id, editForm)
    setSaving(false)
    if (ok) {
      showToast('อัพเดทสำเร็จ')
      if (editing.id === me?.id) await refreshUser()
      setEditing(null)
      load()
    }
    else showToast(data.message || 'เกิดข้อผิดพลาด')
  }

  const handleDelete = async (u) => {
    if (u.id === me?.id) { showToast('ไม่สามารถลบบัญชีตัวเองได้'); return }
    if (!confirm(`ลบ user "${u.username}"?`)) return
    const { ok, data } = await api.admin.deleteUser(u.id)
    if (ok) { showToast('ลบผู้ใช้สำเร็จ'); load() }
    else showToast(data.message || 'เกิดข้อผิดพลาด')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-tight">จัดการผู้ใช้</h2>
        <button onClick={load} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><RefreshCw size={14} /></button>
      </div>

      {toast && <div className="px-4 py-3 bg-black text-white text-sm font-semibold rounded-xl">{toast}</div>}

      <div className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden">
        {loading ? <div className="py-16"><Spinner /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#F2F0F1]">
                <tr>
                  {['Username', 'Email', 'Credit', 'Reward', 'Admin', 'จัดการ'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-black uppercase tracking-wide text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-black rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">{u.username?.[0]?.toUpperCase()}</span>
                        </div>
                        <span className="text-sm font-semibold">{u.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{u.email}</td>
                    <td className="px-4 py-3 text-sm font-bold">{u.credit?.toFixed(2)} ฿</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{u.reward?.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {u.is_admin
                        ? <span className="text-xs font-bold px-2 py-1 bg-black text-white rounded-full">Admin</span>
                        : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(u)}
                          title="แก้ไขผู้ใช้"
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-black">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => openOrders(u)}
                          title="ดูประวัติการสั่งซื้อ"
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-blue-500 hover:text-blue-700">
                          <Package size={14} />
                        </button>
                        <button onClick={() => handleDelete(u)}
                          title="ลบผู้ใช้"
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {editing && (
          <Modal open title={`แก้ไข: ${editing.username}`} onClose={() => setEditing(null)}>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase mb-1">Credit (฿)</label>
                <input type="number" value={editForm.credit}
                  onChange={e => setEditForm(f => ({ ...f, credit: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase mb-1">Reward Points</label>
                <input type="number" value={editForm.reward}
                  onChange={e => setEditForm(f => ({ ...f, reward: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm transition-colors" />
              </div>
              <label className="flex items-center gap-3 p-3 border-2 border-gray-200 rounded-xl cursor-pointer hover:border-black transition-colors">
                <input type="checkbox" checked={editForm.is_admin}
                  onChange={e => setEditForm(f => ({ ...f, is_admin: e.target.checked }))}
                  className="w-4 h-4 accent-black" />
                <div>
                  <p className="text-sm font-bold">สิทธิ์ Admin</p>
                  <p className="text-xs text-gray-400">เข้าถึง Admin Panel ได้</p>
                </div>
              </label>
              {editForm.is_admin && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-700">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>Admin มีสิทธิ์เต็มในการจัดการระบบ กรุณาตรวจสอบให้แน่ใจ</span>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setEditing(null)} className="px-5 py-2 border-2 border-gray-200 rounded-full text-sm font-semibold hover:border-black transition-colors">ยกเลิก</button>
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2 bg-black text-white rounded-full text-sm font-bold hover:bg-gray-800 disabled:opacity-40 transition-colors">
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>
          </Modal>
        )}
        {viewingOrders && (
          <Modal open title={`ประวัติการสั่งซื้อ: ${viewingOrders.username}`} onClose={() => setViewingOrders(null)}>
            <div className="space-y-4">
              {ordersLoading ? (
                <div className="py-8"><Spinner /></div>
              ) : userOrders.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm font-semibold">ยังไม่มีประวัติการซื้อสินค้า</div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
                  {userOrders.map(o => (
                    <div key={o.id} className="flex items-center gap-3 p-3.5 border-2 border-gray-100 rounded-xl hover:border-gray-200 transition-all bg-gray-50/30">
                      {o.product_image && (
                        <img src={o.product_image} alt={o.product_name} className="w-12 h-12 object-cover rounded-lg border-2 border-gray-100" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-black truncate">{o.product_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">จำนวน: {o.quantity} ชิ้น | ยอดรวม: {(o.product_price * o.quantity).toFixed(2)} ฿</p>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">{o.dt_purchased}</p>
                      </div>
                      {o.refund && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-600 rounded-full shrink-0">คืนเงินแล้ว</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end pt-2">
                <button onClick={() => setViewingOrders(null)} className="px-5 py-2 bg-black text-white rounded-full text-sm font-bold hover:bg-gray-800 transition-colors">
                  ปิด
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── TAB: CHAT MANAGEMENT ────────────────────────────────────────────────────

function ChatBubble({ msg }) {
  const isAdmin = msg.sender === 'admin'
  const isBot = msg.sender === 'bot'
  const wrap = isAdmin ? 'justify-end' : 'justify-start'
  const color = isAdmin
    ? 'bg-black text-white rounded-2xl rounded-br-md'
    : isBot
      ? 'bg-[#F2F0F1] text-gray-700 rounded-2xl rounded-bl-md border border-dashed border-gray-300'
      : 'bg-white border-2 border-gray-200 rounded-2xl rounded-bl-md'

  return (
    <div className={`flex ${wrap} mb-2`}>
      <div className="flex flex-col max-w-[75%]">
        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
          {isAdmin ? <><ShieldCheck size={11} /> คุณ (Admin)</> : isBot ? <><Bot size={11} /> Bot</> : 'ลูกค้า'}
        </div>
        <div className={`${color} px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words`}>{msg.text}</div>
        <span className="text-[10px] text-gray-400 mt-0.5 px-1 self-end">
          {msg.created_at?.slice(11, 16)}
        </span>
      </div>
    </div>
  )
}

function ChatManagement() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(null) // {id, username, user_id}
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState('')
  const scrollRef = useRef(null)
  const pollRef = useRef(null)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    const { data } = await api.admin.chatSessions()
    setSessions(data?.results || [])
    setLoading(false)
  }, [])

  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) return
    const { ok, data } = await api.admin.chatMessages(sessionId)
    if (ok) {
      setMessages(data.results || [])
      setActive(prev => prev ? { ...prev, username: data.username, user_id: data.user_id } : prev)
    }
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  // poll active conversation
  useEffect(() => {
    if (!active?.id) return
    loadMessages(active.id)
    pollRef.current = setInterval(() => {
      loadMessages(active.id)
      loadSessions()
    }, 5000)
    return () => clearInterval(pollRef.current)
  }, [active?.id, loadMessages, loadSessions])

  // auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, active?.id])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleSend = async () => {
    const t = text.trim()
    if (!t || !active || sending) return
    setSending(true)
    const { ok, data } = await api.admin.chatReply(active.id, t)
    setSending(false)
    if (ok) {
      setText('')
      setMessages(m => [...m, data.message])
      loadSessions()
    } else {
      showToast(data.message || 'ส่งไม่สำเร็จ')
    }
  }

  const handleDelete = async (s, e) => {
    e.stopPropagation()
    if (!confirm(`ลบบทสนทนากับ "${s.username}"?`)) return
    const { ok } = await api.admin.chatDelete(s.id)
    if (ok) {
      showToast('ลบแล้ว')
      if (active?.id === s.id) { setActive(null); setMessages([]) }
      loadSessions()
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black uppercase tracking-tight">แชทลูกค้า</h2>
        <button onClick={loadSessions} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {toast && <div className="px-4 py-3 bg-black text-white text-sm font-semibold rounded-xl">{toast}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[500px]">

        {/* Session list */}
        <div className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 shrink-0">
            <p className="text-xs font-black uppercase tracking-wide text-gray-600">บทสนทนา ({sessions.length})</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <div className="py-10"><Spinner /></div> : sessions.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">ยังไม่มีบทสนทนา</div>
            ) : sessions.map(s => (
              <button key={s.id} onClick={() => setActive({ id: s.id, username: s.username, user_id: s.user_id })}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors group ${active?.id === s.id ? 'bg-[#F2F0F1]' : ''
                  }`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-black rounded-full flex items-center justify-center shrink-0 relative">
                    <span className="text-white text-xs font-bold">{s.username?.[0]?.toUpperCase()}</span>
                    {s.unread_admin > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                        {s.unread_admin}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold truncate">{s.username}</p>
                      <span className="text-[10px] text-gray-400 shrink-0">{s.updated_at?.slice(11, 16)}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {s.last_sender === 'admin' ? 'คุณ: ' : s.last_sender === 'bot' ? 'Bot: ' : ''}
                      {s.last_message || '—'}
                    </p>
                  </div>
                  <button onClick={(e) => handleDelete(s, e)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-all">
                    <Trash2 size={12} />
                  </button>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Conversation pane */}
        <div className="bg-white border-2 border-gray-100 rounded-2xl overflow-hidden flex flex-col">
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
              <MessageCircle size={40} className="mb-3 opacity-40" />
              <p className="text-sm font-semibold">เลือกบทสนทนาจากรายการด้านซ้าย</p>
              <p className="text-xs mt-1">เพื่อตอบลูกค้าแบบส่วนตัว</p>
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-black rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{active.username?.[0]?.toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-black">{active.username}</p>
                    <p className="text-[10px] text-gray-400 font-mono">{active.user_id}</p>
                  </div>
                </div>
                <button onClick={() => loadMessages(active.id)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <RefreshCw size={14} />
                </button>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">ยังไม่มีข้อความในบทสนทนานี้</div>
                ) : (
                  messages.map(m => <ChatBubble key={m.id} msg={m} />)
                )}
              </div>

              <div className="border-t border-gray-100 p-3 bg-white shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                    }}
                    rows={1}
                    placeholder="พิมพ์ตอบลูกค้า... (Enter เพื่อส่ง / Shift+Enter ขึ้นบรรทัด)"
                    className="flex-1 resize-none px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm transition-colors max-h-32"
                  />
                  <button onClick={handleSend} disabled={!text.trim() || sending}
                    className="p-2.5 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 transition-colors shrink-0">
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── TAB: ORDER MANAGEMENT ───────────────────────────────────────────────────

const ORDER_STATUS = {
  pending:    { label: 'รอดำเนินการ', icon: Clock,       cls: 'bg-gray-100 text-gray-600' },
  processing: { label: 'กำลังจัดส่ง',  icon: Box,         cls: 'bg-blue-100 text-blue-700' },
  shipped:    { label: 'จัดส่งแล้ว',   icon: Truck,       cls: 'bg-amber-100 text-amber-700' },
  completed:  { label: 'สำเร็จ',       icon: Check,       cls: 'bg-green-100 text-green-700' },
  refunded:   { label: 'คืนเงิน',      icon: XCircle,     cls: 'bg-orange-100 text-orange-600' },
  cancelled:  { label: 'ยกเลิก',       icon: XCircle,     cls: 'bg-red-100 text-red-600' },
}
const STATUS_FLOW = ['pending', 'processing', 'shipped', 'completed']

function OrderManagement() {
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.admin.orders(filter).then(({ data }) => {
      setOrders(data.results || [])
      setLoading(false)
    })
  }, [filter])

  useEffect(() => { load() }, [load])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const setStatus = async (rid, status) => {
    setBusy(rid)
    const { ok, data } = await api.admin.updateOrderStatus(rid, status)
    setBusy(null)
    if (ok && data.status) { showToast(data.message); load() }
    else showToast(data.message || 'เกิดข้อผิดพลาด')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black uppercase tracking-tight">คำสั่งซื้อ</h2>
        <div className="flex flex-wrap gap-2">
          {['all', ...STATUS_FLOW].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${filter === s ? 'bg-black text-white border-black' : 'border-gray-200 text-gray-600 hover:border-black'}`}>
              {s === 'all' ? 'ทั้งหมด' : ORDER_STATUS[s].label}
            </button>
          ))}
          <button onClick={load} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><RefreshCw size={14} /></button>
        </div>
      </div>

      {toast && <div className="px-4 py-3 bg-black text-white text-sm font-semibold rounded-xl">{toast}</div>}

      <div className="space-y-3">
        {loading ? <div className="py-16"><Spinner /></div> : orders.length === 0 ? (
          <div className="text-center py-20 text-gray-400 font-medium bg-white border-2 border-gray-100 rounded-2xl">ไม่มีคำสั่งซื้อ</div>
        ) : orders.map(o => {
          const st = ORDER_STATUS[o.status] || ORDER_STATUS.pending
          const StIcon = st.icon
          const idx = STATUS_FLOW.indexOf(o.status)
          const next = idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null
          return (
            <div key={o.receipt_id} className="bg-white border-2 border-gray-100 rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs font-mono text-gray-400">#{String(o.receipt_id).slice(0, 8).toUpperCase()}</p>
                  <p className="text-sm font-bold">{o.username} <span className="text-gray-400 font-normal">· {o.dt_purchased}</span></p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-black text-black">{o.total.toLocaleString(undefined, { minimumFractionDigits: 2 })} ฿</span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${st.cls}`}><StIcon size={12} /> {st.label}</span>
                </div>
              </div>

              <div className="text-sm text-gray-600 mb-3">
                {o.items.map((it, i) => <span key={i}>{it.name} <span className="text-gray-400">x{it.quantity}</span>{i < o.items.length - 1 ? ', ' : ''}</span>)}
              </div>

              {o.shipping_address ? (
                <div className="flex items-start gap-2 mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <MapPin size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <p className="font-bold text-amber-800">
                      {o.shipping_address.recipient}
                      {o.shipping_address.phone && <span className="font-normal text-amber-600"> · {o.shipping_address.phone}</span>}
                    </p>
                    <p className="text-amber-700">
                      {[
                        o.shipping_address.address,
                        o.shipping_address.subdistrict && `ต.${o.shipping_address.subdistrict}`,
                        o.shipping_address.district && `อ.${o.shipping_address.district}`,
                        o.shipping_address.province && `จ.${o.shipping_address.province}`,
                        o.shipping_address.postal_code,
                      ].filter(Boolean).join(' ')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-4 text-xs text-sky-600 font-semibold">
                  <Zap size={12} /> จัดส่งออนไลน์ (ดิจิทัล) — ไม่ต้องส่งพัสดุ
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {next && (
                  <button onClick={() => setStatus(o.receipt_id, next)} disabled={busy === o.receipt_id}
                    className="flex items-center gap-1.5 px-4 py-2 bg-black text-white text-xs font-bold rounded-full hover:bg-gray-800 disabled:opacity-40 transition-colors">
                    <Truck size={13} /> เลื่อนเป็น "{ORDER_STATUS[next].label}"
                  </button>
                )}
                <select value={o.status} onChange={e => setStatus(o.receipt_id, e.target.value)} disabled={busy === o.receipt_id}
                  className="px-3 py-2 border-2 border-gray-200 rounded-full text-xs font-semibold bg-white focus:border-black outline-none cursor-pointer">
                  {Object.keys(ORDER_STATUS).map(k => <option key={k} value={k}>{ORDER_STATUS[k].label}</option>)}
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── MAIN ADMIN PAGE ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard', label: 'ภาพรวม', icon: LayoutDashboard },
  { id: 'orders', label: 'คำสั่งซื้อ', icon: ShoppingBag },
  { id: 'products', label: 'สินค้า', icon: Package },
  { id: 'coupons', label: 'คูปอง', icon: Gift },
  { id: 'users', label: 'ผู้ใช้', icon: Users },
  { id: 'chat', label: 'แชท', icon: MessageCircle },
]

export default function Admin() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('dashboard')

  useEffect(() => {
    if (!loading && (!user || !user.is_admin)) navigate('/')
  }, [user, loading, navigate])

  if (loading || !user?.is_admin) return <Spinner />

  return (
    <div className="flex min-h-screen bg-[#F2F0F1]">

      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 bg-black shrink-0 min-h-screen pt-8">
        <div className="px-6 mb-8">
          <p className="text-white font-black text-lg uppercase tracking-tight">Admin Panel</p>
          <p className="text-gray-500 text-xs mt-0.5">{user.username}</p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left ${tab === t.id ? 'bg-white text-black' : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}>
                <Icon size={16} /> {t.label}
              </button>
            )
          })}
        </nav>
        <div className="p-4">
          <button onClick={() => navigate('/')} className="w-full text-center text-xs text-gray-600 hover:text-white transition-colors py-2">
            ← กลับหน้าหลัก
          </button>
        </div>
      </aside>

      {/* Mobile tab bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-black z-40 flex">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors ${tab === t.id ? 'text-white' : 'text-gray-600'
                }`}>
              <Icon size={18} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Main content */}
      <main className="flex-1 p-6 lg:p-8 pb-24 lg:pb-8 overflow-x-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {tab === 'dashboard' && <Dashboard />}
            {tab === 'orders' && <OrderManagement />}
            {tab === 'products' && <ProductManagement />}
            {tab === 'coupons' && <CouponManagement />}
            {tab === 'users' && <UserManagement />}
            {tab === 'chat' && <ChatManagement />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

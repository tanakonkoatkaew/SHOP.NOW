import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, SlidersHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../services/api'
import ProductCard from '../components/ProductCard'
import Spinner from '../components/Spinner'

const CATS = [
  { label: 'ทั้งหมด',   value: 'all' },
  { label: 'เกม',       value: 'game' },
  { label: 'ซอฟต์แวร์', value: 'software' },
  { label: 'เติมเงิน',  value: 'topup' },
  { label: 'แฟชั่น',    value: 'fashion' },
]

const SORT_OPTIONS = [
  { label: 'ล่าสุด',         value: 'new' },
  { label: 'ลดราคาก่อน',     value: 'sale' },
  { label: 'ราคา: น้อย-มาก', value: 'price_asc' },
  { label: 'ราคา: มาก-น้อย', value: 'price_desc' },
]

function FilterSection({ title, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-gray-200 pb-5">
      <button className="flex items-center justify-between w-full mb-4" onClick={() => setOpen(v => !v)}>
        <span className="font-black text-sm uppercase tracking-wide">{title}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && children}
    </div>
  )
}

export default function Products() {
  const location = useLocation()
  const initCat = new URLSearchParams(location.search).get('cat') || 'all'

  const [all, setAll]         = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading]   = useState(true)
  const [cat, setCat]           = useState(initCat)
  const [q, setQ]               = useState('')
  const [sort, setSort]         = useState('new')
  const [maxPrice, setMaxPrice] = useState(5000)
  const [inStock, setInStock]   = useState(false)
  const [saleOnly, setSaleOnly] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    api.products().then(({ ok, data }) => {
      const items = ok ? (data.results || []) : []
      setAll(items)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    let res = all
    if (cat !== 'all') res = res.filter(p => String(p.cate) === cat || p.name?.toLowerCase().includes(cat))
    if (q.trim()) res = res.filter(p => p.name?.toLowerCase().includes(q.toLowerCase()) || p.description?.toLowerCase().includes(q.toLowerCase()))
    res = res.filter(p => parseFloat(p.price) <= maxPrice)
    if (inStock) res = res.filter(p => (p.stock ?? 0) > 0)
    if (saleOnly) res = res.filter(p => p.on_sale)
    if (sort === 'price_asc')  res = [...res].sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
    if (sort === 'price_desc') res = [...res].sort((a, b) => parseFloat(b.price) - parseFloat(a.price))
    if (sort === 'sale')       res = [...res].sort((a, b) => (b.on_sale ? 1 : 0) - (a.on_sale ? 1 : 0))
    setFiltered(res)
  }, [cat, q, sort, maxPrice, inStock, saleOnly, all])

  const activeFilters = [
    cat !== 'all' && CATS.find(c => c.value === cat)?.label,
    q.trim() && `"${q}"`,
    maxPrice < 5000 && `≤ ${maxPrice} ฿`,
    inStock && 'มีสินค้า',
    saleOnly && 'ลดราคา',
  ].filter(Boolean)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 w-full">

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-4xl font-black text-black uppercase tracking-tight">สินค้าทั้งหมด</h1>
        <p className="text-gray-500 text-sm mt-1">{filtered.length} รายการ</p>
      </div>

      <div className="flex gap-8">

        {/* ── SIDEBAR ──────────────────────────────── */}
        <aside className={`
          fixed inset-0 z-40 bg-white lg:static lg:block lg:w-60 lg:shrink-0
          ${sidebarOpen ? 'block' : 'hidden'}
        `}>
          {/* Mobile header */}
          <div className="lg:hidden flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <span className="font-black text-lg">ตัวกรอง</span>
            <button onClick={() => setSidebarOpen(false)}><X size={20} /></button>
          </div>

          <div className="p-6 lg:p-0 space-y-6 overflow-y-auto max-h-screen lg:max-h-none">

            <FilterSection title="หมวดหมู่">
              <div className="space-y-2">
                {CATS.map(c => (
                  <label key={c.value} className="flex items-center gap-3 cursor-pointer group">
                    <div onClick={() => { setCat(c.value); setSidebarOpen(false) }}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                        cat === c.value ? 'bg-black border-black' : 'border-gray-300 group-hover:border-black'
                      }`}>
                      {cat === c.value && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                    </div>
                    <span className={`text-sm cursor-pointer ${cat === c.value ? 'font-bold text-black' : 'text-gray-600'}`}
                      onClick={() => { setCat(c.value); setSidebarOpen(false) }}>
                      {c.label}
                    </span>
                  </label>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="ราคาสูงสุด">
              <div className="space-y-3">
                <input
                  type="range"
                  min={50} max={5000} step={50}
                  value={maxPrice}
                  onChange={e => setMaxPrice(Number(e.target.value))}
                  className="w-full accent-black"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>50 ฿</span>
                  <span className="font-bold text-black">{maxPrice} ฿</span>
                </div>
              </div>
            </FilterSection>

            <FilterSection title="ตัวเลือก">
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={inStock} onChange={e => setInStock(e.target.checked)} className="w-4 h-4 accent-black" />
                  <span className={`text-sm ${inStock ? 'font-bold text-black' : 'text-gray-600'}`}>เฉพาะที่มีสินค้า</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={saleOnly} onChange={e => setSaleOnly(e.target.checked)} className="w-4 h-4 accent-black" />
                  <span className={`text-sm ${saleOnly ? 'font-bold text-red-500' : 'text-gray-600'}`}>กำลังลดราคา 🔥</span>
                </label>
              </div>
            </FilterSection>

          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── MAIN CONTENT ─────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Controls row */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหาสินค้า..."
                value={q}
                onChange={e => setQ(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-full focus:outline-none focus:border-black text-sm transition-colors"
              />
            </div>

            <div className="flex gap-2 shrink-0">
              {/* Filter button (mobile) */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden flex items-center gap-2 px-4 py-2.5 border-2 border-gray-200 rounded-full text-sm font-medium hover:border-black transition-colors"
              >
                <SlidersHorizontal size={16} /> ตัวกรอง
              </button>

              {/* Sort */}
              <select
                value={sort}
                onChange={e => setSort(e.target.value)}
                className="px-4 py-2.5 border-2 border-gray-200 rounded-full text-sm font-medium focus:outline-none focus:border-black transition-colors bg-white cursor-pointer"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Active filters */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {activeFilters.map(f => (
                <span key={f} className="flex items-center gap-1.5 px-3 py-1 bg-black text-white text-xs font-semibold rounded-full">
                  {f}
                </span>
              ))}
              <button
                onClick={() => { setCat('all'); setQ(''); setMaxPrice(5000); setSort('new'); setInStock(false); setSaleOnly(false) }}
                className="px-3 py-1 border-2 border-gray-300 text-xs font-semibold rounded-full hover:border-black transition-colors"
              >
                ล้างทั้งหมด
              </button>
            </div>
          )}

          {/* Grid */}
          {loading ? (
            <Spinner />
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <SlidersHorizontal size={40} className="mx-auto mb-4 text-gray-300" />
              <p className="font-bold text-gray-400">ไม่พบสินค้าที่ตรงกัน</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Ticket, Copy, Check, ArrowRight, Infinity as InfinityIcon } from 'lucide-react'
import { api } from '../services/api'

function CouponCard({ c, index }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.code)
    } catch {
      // Fallback for insecure contexts
      const el = document.createElement('textarea')
      el.value = c.code
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="relative flex bg-white border-2 border-gray-100 rounded-2xl overflow-hidden hover:border-black transition-colors"
    >
      {/* Left: discount */}
      <div className="flex flex-col items-center justify-center bg-black text-white px-6 py-6 shrink-0 relative">
        <span className="text-3xl font-black leading-none">{c.discount}%</span>
        <span className="text-[11px] font-semibold text-gray-300 mt-1">ส่วนลด</span>
        {/* perforation */}
        <span className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-[#F2F0F1] rounded-full" />
      </div>

      {/* Right: details */}
      <div className="flex-1 p-5 min-w-0">
        <p className="text-sm text-gray-500 mb-2 line-clamp-2">{c.msg || 'คูปองส่วนลดพิเศษ'}</p>
        <div className="flex items-center gap-2 mb-3">
          <code className="px-3 py-1.5 bg-[#F2F0F1] border border-dashed border-gray-300 rounded-lg font-mono font-bold text-black tracking-wider">
            {c.code}
          </code>
          <button
            onClick={copy}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${copied ? 'bg-green-500 text-white' : 'bg-black text-white hover:bg-gray-800'
              }`}
          >
            {copied ? <><Check size={13} /> คัดลอกแล้ว</> : <><Copy size={13} /> คัดลอก</>}
          </button>
        </div>
        <p className="text-xs text-gray-400 flex items-center gap-1">
          {c.remaining == null
            ? <><InfinityIcon size={13} /> ใช้ได้ไม่จำกัด</>
            : <>เหลือสิทธิ์ {c.remaining} ครั้ง</>}
        </p>
      </div>
    </motion.div>
  )
}

export default function Coupons() {
  const [coupons, setCoupons] = useState(null)

  useEffect(() => {
    api.publicCoupons().then(({ ok, data }) => {
      setCoupons(ok && data.status ? (data.results || []) : [])
    })
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-6 py-14 w-full">
      <div className="text-center mb-10">
        <div className="inline-flex w-14 h-14 bg-black rounded-2xl items-center justify-center mb-4">
          <Ticket size={26} className="text-white" />
        </div>
        <h1 className="text-4xl font-black uppercase tracking-tight">คูปองส่วนลด</h1>
        <p className="text-gray-500 mt-2">คัดลอกโค้ดแล้วนำไปใช้ตอนสั่งซื้อสินค้าเพื่อรับส่วนลดทันที</p>
      </div>

      {coupons === null ? (
        <div className="grid sm:grid-cols-2 gap-5">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-[#F2F0F1] rounded-2xl animate-pulse" />)}
        </div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 font-medium mb-6">ยังไม่มีคูปองที่ใช้ได้ในขณะนี้</p>
          <Link to="/products" className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white text-sm font-bold rounded-full hover:bg-gray-800 transition-colors">
            เลือกซื้อสินค้า <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-5">
            {coupons.map((c, i) => <CouponCard key={c.code} c={c} index={i} />)}
          </div>
          <div className="text-center mt-10">
            <Link to="/products" className="inline-flex items-center gap-2 px-6 py-3 border-2 border-black text-black text-sm font-bold rounded-full hover:bg-black hover:text-white transition-all">
              ไปเลือกซื้อสินค้า <ArrowRight size={16} />
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

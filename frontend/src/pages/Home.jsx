import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Zap, ShieldCheck, Headphones, Truck } from 'lucide-react'
import { api } from '../services/api'
import ProductCard from '../components/ProductCard'

// Round down to a "nice" marketing threshold and append "+" (e.g. 22 -> "20+")
function niceCount(n) {
  if (n == null) return '—'
  if (n < 10) return String(n)
  if (n < 100) return `${Math.floor(n / 10) * 10}+`
  if (n < 1000) return `${Math.floor(n / 100) * 100}+`
  return `${Math.floor(n / 1000)},${String(Math.floor((n % 1000) / 100) * 100).padStart(3, '0')}+`
}

const fallbackStats = [
  { num: '200+', label: 'สินค้าทั้งหมด' },
  { num: '2,000+', label: 'ลูกค้าที่พอใจ' },
  { num: '4.8★', label: 'คะแนนเฉลี่ย' },
]

const features = [
  { icon: Zap, title: 'ดิจิทัลรับทันที', desc: 'เกม ซอฟต์แวร์ บัตรเติมเงิน ส่งคีย์ให้ทันทีหลังชำระเงิน' },
  { icon: Truck, title: 'จัดส่งทั่วไทย', desc: 'สินค้าแฟชั่นและพัสดุ จัดส่งถึงหน้าบ้าน ติดตามสถานะได้' },
  { icon: ShieldCheck, title: 'ชำระเงินปลอดภัย', desc: 'รองรับบัตรเครดิต/เดบิต และพร้อมเพย์ ผ่าน Stripe' },
  { icon: Headphones, title: 'ซัพพอร์ต 24/7', desc: 'ทีมงานพร้อมช่วยเหลือตลอดเวลา' },
]

const testimonials = [
  { name: 'USER 1', rating: 5, text: 'Review Text' },
  { name: 'USER 2', rating: 5, text: 'Review Text' },
  { name: 'USER 3', rating: 4, text: 'Review Text' },
]

function StarRow({ n }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i <= n ? '#FFC633' : '#e5e7eb'}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  )
}

export default function Home() {
  const [products, setProducts] = useState([])
  const [stats, setStats] = useState(fallbackStats)
  const [meta, setMeta] = useState({ products: null, avg_rating: null })

  useEffect(() => {
    api.products().then(({ ok, data }) => {
      if (ok && data.results) setProducts(data.results.slice(0, 8))
    })
    api.publicStats().then(({ ok, data }) => {
      if (ok && data.status) {
        setStats([
          { num: niceCount(data.products),  label: 'สินค้าทั้งหมด' },
          { num: niceCount(data.customers), label: 'ลูกค้าที่พอใจ' },
          { num: data.avg_rating != null ? `${data.avg_rating}★` : '—', label: 'คะแนนเฉลี่ย' },
        ])
        setMeta({ products: data.products, avg_rating: data.avg_rating })
      }
    })
  }, [])

  return (
    <div className="flex flex-col">

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="bg-[#F2F0F1]">
        <div className="max-w-7xl mx-auto px-6 py-16 lg:py-24 flex flex-col lg:flex-row items-center gap-12">

          {/* Left text */}
          <motion.div
            initial={{ opacity: 0, x: -32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1 space-y-7"
          >
            <h1 className="text-5xl lg:text-7xl font-black text-black leading-[1.05] tracking-tight uppercase">
              ช้อปสินค้า<br />
              <span className="relative inline-block">
                ที่ใช่สำหรับคุณ
                <svg className="absolute -bottom-1 left-0 w-full" height="8" viewBox="0 0 300 8" preserveAspectRatio="none">
                  <path d="M0 6 Q75 0 150 6 Q225 12 300 6" stroke="black" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                </svg>
              </span>
            </h1>

            <p className="text-gray-500 text-base leading-relaxed max-w-md">
              ครบทั้งสินค้าดิจิทัลและแฟชั่น — เกม ซอฟต์แวร์ บัตรเติมเงิน รับคีย์ทันที
              ส่วนเสื้อผ้าและพัสดุ จัดส่งถึงหน้าบ้าน
            </p>

            {/* Delivery modes */}
            <div className="flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-700">
                <Zap size={13} className="text-sky-500" /> ดิจิทัล — รับทันที
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-700">
                <Truck size={13} className="text-amber-500" /> พัสดุ — ส่งถึงบ้าน
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link to="/products" className="flex items-center gap-2 px-8 py-4 bg-black text-white font-bold rounded-full hover:bg-gray-800 transition-colors">
                ช้อปเลย <ArrowRight size={18} />
              </Link>
              <Link to="/products?cat=fashion" className="flex items-center gap-2 px-8 py-4 border-2 border-black text-black font-bold rounded-full hover:bg-black hover:text-white transition-colors">
                คอลเลกชันแฟชั่น
              </Link>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-8 pt-4 border-t border-gray-300">
              {stats.map(s => (
                <div key={s.num}>
                  <p className="text-2xl font-black text-black">{s.num}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right visual */}
          <motion.div
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex-shrink-0 w-full lg:w-auto flex justify-center"
          >
            <div className="relative">
              {/* Main card */}
              <div className="w-72 h-80 lg:w-96 lg:h-96 bg-black rounded-3xl flex items-center justify-center overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-black" />
                <div className="relative z-10 text-center p-8">
                  <div className="text-6xl mb-4">🛍️</div>
                  <p className="text-white font-black text-xl uppercase tracking-wider">Shop.Now</p>
                  <p className="text-gray-400 text-sm mt-2">Digital & Lifestyle</p>
                  <div className="mt-6 flex justify-center gap-2">
                    {['🎮', '💻', '👕', '🔑'].map(e => (
                      <div key={e} className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-lg">{e}</div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Floating badge */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                className="absolute -bottom-5 -left-6 bg-white rounded-2xl shadow-xl px-5 py-3 flex items-center gap-3"
              >
                <div className="w-10 h-10 bg-[#F2F0F1] rounded-xl flex items-center justify-center text-xl">⭐</div>
                <div>
                  <p className="font-black text-black text-sm">{meta.avg_rating != null ? `${meta.avg_rating} / 5.0` : 'รีวิวจากผู้ซื้อจริง'}</p>
                  <p className="text-xs text-gray-500">คะแนนลูกค้า</p>
                </div>
              </motion.div>

              {/* Floating badge 2 */}
              <motion.div
                animate={{ y: [0, 8, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', delay: 1 }}
                className="absolute -top-4 -right-4 bg-black text-white rounded-2xl shadow-xl px-4 py-2.5"
              >
                <p className="font-black text-sm">{niceCount(meta.products)} สินค้า</p>
                <p className="text-xs text-gray-400">พร้อมจำหน่าย</p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── NEW ARRIVALS ─────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-4xl font-black text-black uppercase tracking-tight">สินค้าแนะนำ</h2>
              <div className="h-1 w-24 bg-black mt-2 rounded-full" />
            </div>
            <Link to="/products" className="flex items-center gap-2 px-6 py-3 border-2 border-black text-black text-sm font-bold rounded-full hover:bg-black hover:text-white transition-all">
              ดูทั้งหมด <ArrowRight size={16} />
            </Link>
          </div>

          {products.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-square bg-[#F2F0F1] rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
              {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          )}
        </div>
      </section>

      {/* ── BROWSE BY CATEGORY ───────────────────────────── */}
      <section className="py-16 px-6 bg-[#F2F0F1]">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-black text-black uppercase tracking-tight mb-8">หมวดหมู่สินค้า</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'เกม', emoji: '🎮', value: 'game', dark: false, mode: 'digital' },
              { label: 'ซอฟต์แวร์', emoji: '💻', value: 'software', dark: true, mode: 'digital' },
              { label: 'เติมเงิน', emoji: '💳', value: 'topup', dark: false, mode: 'digital' },
              { label: 'แฟชั่น', emoji: '👕', value: 'fashion', dark: false, mode: 'physical' },
            ].map(c => (
              <Link
                key={c.value}
                to={`/products?cat=${c.value}`}
                className={`group ${c.dark ? 'bg-black' : 'bg-white'} rounded-2xl p-8 flex flex-col gap-4 hover:scale-[1.02] transition-transform duration-300 border border-gray-200`}
              >
                <span className="text-4xl">{c.emoji}</span>
                <div className="flex flex-col gap-2">
                  <span className={`font-black text-xl uppercase tracking-tight ${c.dark ? 'text-white' : 'text-black'}`}>{c.label}</span>
                  <span className={`flex items-center gap-1 w-fit text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    c.mode === 'physical' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
                  }`}>
                    {c.mode === 'physical' ? <><Truck size={10} /> จัดส่งพัสดุ</> : <><Zap size={10} /> ส่งออนไลน์</>}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY US ───────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-black text-black uppercase tracking-tight text-center mb-12">ทำไมต้องเลือก Shop.Now?</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group p-6 border-2 border-gray-100 rounded-2xl hover:border-black transition-colors duration-300"
              >
                <div className="w-12 h-12 bg-[#F2F0F1] rounded-xl flex items-center justify-center mb-4 group-hover:bg-black transition-colors duration-300">
                  <Icon size={22} className="text-black group-hover:text-white transition-colors duration-300" />
                </div>
                <h3 className="font-black text-black mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────── */}
      <section className="py-16 px-6 bg-[#F2F0F1]">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-black text-black uppercase tracking-tight text-center mb-12">ความคิดเห็นลูกค้า</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-2xl p-6 border border-gray-200"
              >
                <StarRow n={t.rating} />
                <p className="text-gray-700 text-sm mt-4 leading-relaxed">"{t.text}"</p>
                <p className="font-black text-black text-sm mt-4">{t.name}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

    </div>
  )
}

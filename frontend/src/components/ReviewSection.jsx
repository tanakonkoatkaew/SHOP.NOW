import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Star, Trash2, Pencil } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { Stars } from './ProductCard'

function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '' }
}

function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button"
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="p-0.5 transition-transform hover:scale-110"
          aria-label={`${n} ดาว`}>
          <Star size={26}
            fill={(hover || value) >= n ? '#FFC633' : 'none'}
            stroke={(hover || value) >= n ? '#FFC633' : '#d1d5db'} />
        </button>
      ))}
      {value > 0 && <span className="text-sm font-bold text-gray-600 ml-1">{value}/5</span>}
    </div>
  )
}

export default function ReviewSection({ productId }) {
  const { user } = useAuth()
  const [reviews, setReviews] = useState([])
  const [summary, setSummary] = useState({ avg_rating: null, count: 0 })
  const [mine, setMine]       = useState(null)
  const [canReview, setCanReview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rating, setRating]   = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')

  const load = useCallback(async () => {
    const { ok, data } = await api.reviews.list(productId)
    if (ok && data.status) {
      setReviews(data.results || [])
      setSummary(data.summary || { avg_rating: null, count: 0 })
    }
    setLoading(false)
  }, [productId])

  useEffect(() => {
    load()
    if (user) {
      api.reviews.mine(productId).then(({ ok, data }) => {
        if (ok && data.status) {
          setMine(data.result)
          setCanReview(!!data.can_review)
          if (data.result) {
            setRating(data.result.rating)
            setComment(data.result.comment || '')
          }
        }
      })
    }
  }, [productId, user, load])

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  const submit = async (e) => {
    e.preventDefault()
    if (!rating || saving) return
    setSaving(true)
    const { ok, data } = await api.reviews.save(productId, { rating, comment })
    setSaving(false)
    if (ok && data.status) {
      setMine(data.result)
      showMsg(mine ? 'อัปเดตรีวิวแล้ว ✓' : 'ขอบคุณสำหรับรีวิว ✓')
      load()
    } else showMsg(data.message || 'เกิดข้อผิดพลาด')
  }

  const removeMine = async () => {
    if (!confirm('ลบรีวิวของคุณ?')) return
    const { ok, data } = await api.reviews.remove(productId)
    if (ok && data.status) {
      setMine(null); setRating(0); setComment('')
      showMsg('ลบรีวิวแล้ว')
      load()
    } else showMsg(data.message || 'เกิดข้อผิดพลาด')
  }

  return (
    <section className="mt-16">
      <h2 className="text-2xl font-black uppercase tracking-tight mb-6">รีวิวสินค้า</h2>

      {/* Summary */}
      <div className="flex items-center gap-4 mb-8">
        {summary.count > 0 ? (
          <>
            <span className="text-5xl font-black">{summary.avg_rating}</span>
            <div>
              <Stars rating={summary.avg_rating} size={18} />
              <p className="text-sm text-gray-500 mt-1">{summary.count} รีวิวจากผู้ซื้อจริง</p>
            </div>
          </>
        ) : (
          <p className="text-gray-400">ยังไม่มีรีวิว — เป็นคนแรกที่รีวิวสินค้านี้!</p>
        )}
      </div>

      {msg && <div className="mb-4 px-4 py-3 bg-black text-white text-sm font-semibold rounded-xl">{msg}</div>}

      {/* Form / gate */}
      {!user ? (
        <div className="mb-8 p-4 bg-[#F2F0F1] rounded-2xl text-sm text-gray-600">
          <Link to="/login" className="font-bold underline">เข้าสู่ระบบ</Link> เพื่อรีวิวสินค้านี้
        </div>
      ) : canReview ? (
        <form onSubmit={submit} className="mb-8 p-5 border-2 border-gray-100 rounded-2xl space-y-3">
          <p className="text-sm font-black uppercase tracking-wide flex items-center gap-1.5">
            {mine ? <><Pencil size={13} /> แก้ไขรีวิวของคุณ</> : 'ให้คะแนนสินค้านี้'}
          </p>
          <StarPicker value={rating} onChange={setRating} />
          <textarea value={comment} onChange={e => setComment(e.target.value)}
            rows={3} maxLength={1000}
            placeholder="เล่าประสบการณ์การใช้งาน (ไม่บังคับ)"
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm transition-colors resize-none" />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={!rating || saving}
              className="px-6 py-2.5 bg-black text-white text-sm font-bold rounded-xl hover:bg-gray-800 disabled:opacity-40 transition-colors">
              {saving ? 'กำลังบันทึก...' : mine ? 'อัปเดตรีวิว' : 'ส่งรีวิว'}
            </button>
            {mine && (
              <button type="button" onClick={removeMine}
                className="flex items-center gap-1 px-4 py-2.5 border-2 border-red-200 text-red-500 text-sm font-bold rounded-xl hover:border-red-400 transition-colors">
                <Trash2 size={14} /> ลบรีวิว
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="mb-8 p-4 bg-[#F2F0F1] rounded-2xl text-sm text-gray-600">
          🛍️ ซื้อสินค้านี้เพื่อรีวิวได้ — เรารับเฉพาะรีวิวจากผู้ซื้อจริง
        </div>
      )}

      {/* List */}
      {loading ? null : reviews.length > 0 && (
        <div className="space-y-4">
          {reviews.map(r => (
            <div key={r.id} className="p-4 border-2 border-gray-100 rounded-2xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 bg-black rounded-full flex items-center justify-center overflow-hidden shrink-0">
                  {r.user.avatar ? (
                    <img src={r.user.avatar} alt={r.user.username} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xs font-bold">{r.user.username?.[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{r.user.username}</p>
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} size={12} />
                    <span className="text-xs text-gray-400">{formatDate(r.created_at)}</span>
                  </div>
                </div>
              </div>
              {r.comment && <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

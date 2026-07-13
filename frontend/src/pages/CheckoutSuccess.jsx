import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { api } from '../services/api'
import { useCart } from '../hooks/useCart'
import { useAuth } from '../hooks/useAuth'

export default function CheckoutSuccess() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { clear } = useCart()
  const { refreshUser } = useAuth()
  const [state, setState] = useState('loading')   // loading | success | error
  const [summary, setSummary] = useState(null)
  const [msg, setMsg] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const sessionId = params.get('session_id')
    if (!sessionId) { setState('error'); setMsg('ไม่พบข้อมูลการชำระเงิน'); return }

    api.confirmPayment(sessionId).then(async ({ ok, data }) => {
      if (ok && data.status) {
        clear()
        await refreshUser()
        setSummary(data.summary)
        setState('success')
      } else {
        setState('error')
        setMsg(data.msg || data.message || 'ยืนยันการชำระเงินไม่สำเร็จ')
      }
    })
  }, [params, clear, refreshUser])

  return (
    <div className="max-w-lg mx-auto px-4 py-20 w-full text-center">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-slate-200 rounded-2xl p-10">
        {state === 'loading' && (
          <>
            <Loader2 size={48} className="mx-auto text-amber-500 animate-spin mb-4" />
            <h1 className="text-xl font-black text-slate-900">กำลังยืนยันการชำระเงิน...</h1>
            <p className="text-slate-500 text-sm mt-2">กรุณารอสักครู่ อย่าปิดหน้านี้</p>
          </>
        )}

        {state === 'success' && (
          <>
            <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
              <CheckCircle size={56} className="mx-auto text-emerald-500 mb-4" />
            </motion.div>
            <h1 className="text-2xl font-black text-slate-900 mb-2">ชำระเงินสำเร็จ! 🎉</h1>
            <p className="text-slate-500 text-sm mb-6">
              ขอบคุณสำหรับคำสั่งซื้อ กำลังดำเนินการจัดส่งสินค้าให้คุณ
              {summary?.points_earned > 0 && <><br />ได้รับ <span className="font-bold text-emerald-600">{summary.points_earned} แต้ม</span> สะสมไว้ครั้งหน้า ⭐</>}
            </p>
            <div className="flex gap-3 justify-center">
              <Link to="/purchase-logs" className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors">ติดตามคำสั่งซื้อ</Link>
              <Link to="/products" className="px-6 py-3 border-2 border-slate-200 hover:border-slate-900 font-bold rounded-xl transition-colors">เลือกซื้อต่อ</Link>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle size={56} className="mx-auto text-red-500 mb-4" />
            <h1 className="text-2xl font-black text-slate-900 mb-2">เกิดปัญหา</h1>
            <p className="text-slate-500 text-sm mb-6">{msg}</p>
            <button onClick={() => navigate('/cart')} className="px-6 py-3 bg-black hover:bg-gray-800 text-white font-bold rounded-xl transition-colors">กลับไปที่ตะกร้า</button>
          </>
        )}
      </motion.div>
    </div>
  )
}

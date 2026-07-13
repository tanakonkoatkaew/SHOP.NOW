import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Gift, Sparkles } from 'lucide-react'
import { api } from '../services/api'
import Modal from '../components/Modal'
import { useAuth } from '../hooks/useAuth'

export default function Topup() {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const [redeemCode, setRedeemCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState({ open: false })

  const submit = async () => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    if (!redeemCode.trim()) return
    setLoading(true)
    const { ok, data } = await api.redeemCode(redeemCode.trim())
    setLoading(false)
    if (ok && data.status) {
      await refreshUser()
      setRedeemCode('')
      setModal({
        open: true, type: 'success', title: 'เติม Store Credit สำเร็จ! 🎉',
        message: data.message || 'เครดิตถูกเพิ่มแล้ว',
        action: { label: 'ไปเลือกซื้อสินค้า', onClick: () => navigate('/products') },
      })
    } else {
      setModal({ open: true, type: 'error', title: 'ไม่สำเร็จ', message: data.message || data.error || 'รหัสไม่ถูกต้อง' })
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 w-full">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Gift size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-black uppercase tracking-tight">เติม Store Credit</h1>
          <p className="text-gray-500 text-sm mt-1">ใช้โค้ด/บัตรของขวัญเพื่อเพิ่มเครดิตในบัญชี</p>
        </div>

        {/* Current balance */}
        {user && (
          <div className="bg-gradient-to-br from-violet-500 to-violet-700 rounded-2xl p-5 text-white mb-6 flex items-center justify-between shadow-lg shadow-violet-200">
            <div>
              <p className="text-xs font-semibold opacity-80">Store Credit คงเหลือ</p>
              <p className="text-3xl font-black">{parseFloat(user.credit || 0).toFixed(2)} ฿</p>
            </div>
            <Gift size={40} className="opacity-40" />
          </div>
        )}

        <div className="bg-white rounded-2xl border-2 border-gray-100 p-6 space-y-5">
          <div className="flex items-start gap-3 p-4 bg-violet-50 border border-violet-100 rounded-xl">
            <Sparkles size={18} className="text-violet-500 shrink-0 mt-0.5" />
            <p className="text-xs text-violet-700 leading-relaxed">
              Store Credit ใช้เป็นส่วนลดตอนชำระเงินได้ (หักก่อนจ่ายบัตร) — สินค้าทั่วไปชำระตรงผ่าน Stripe ได้เลยโดยไม่ต้องเติมก่อน
            </p>
          </div>

          <div>
            <label className="block text-sm font-black uppercase tracking-wide text-black mb-2">รหัสเติมเงิน / บัตรของขวัญ</label>
            <input type="text" value={redeemCode} onChange={e => setRedeemCode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              placeholder="กรอกรหัสที่นี่"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-violet-500 text-sm transition-colors font-mono uppercase" />
          </div>

          <button onClick={submit} disabled={loading || !redeemCode.trim()}
            className="w-full py-4 font-black rounded-xl transition-colors text-sm uppercase tracking-wide disabled:opacity-40 text-white bg-violet-600 hover:bg-violet-700">
            {loading ? 'กำลังดำเนินการ...' : 'ใช้รหัส'}
          </button>
        </div>
      </motion.div>

      <Modal {...modal} onClose={() => setModal({ open: false })} />
    </div>
  )
}

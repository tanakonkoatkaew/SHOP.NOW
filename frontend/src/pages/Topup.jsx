import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wallet, QrCode, Building2, Smartphone, Gift, Upload, X, Link } from 'lucide-react'
import { api } from '../services/api'
import Modal from '../components/Modal'
import { useAuth } from '../hooks/useAuth'

const METHODS = [
  { value: 'promptpay',  label: 'PromptPay',       icon: QrCode,     badge: 'แนะนำ' },
  { value: 'bank',       label: 'โอนธนาคาร',        icon: Building2 },
  { value: 'truewallet', label: 'TrueMoney Wallet', icon: Smartphone },
  { value: 'redeem',     label: 'รหัสเติมเงิน',      icon: Gift },
]

const QUICK = [50, 100, 200, 500, 1000]

function extractAngpaoHash(input) {
  const s = input.trim()
  if (s.includes('gift.truemoney.com')) {
    try {
      const url = new URL(s)
      return url.searchParams.get('v') || ''
    } catch { return '' }
  }
  return s  // assume it's already the hash
}

export default function Topup() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [amount, setAmount]         = useState('')
  const [method, setMethod]         = useState('promptpay')
  const [redeemCode, setRedeemCode] = useState('')
  const [angpaoUrl, setAngpaoUrl]   = useState('')
  const [slip, setSlip]             = useState(null)
  const [loading, setLoading]       = useState(false)
  const [modal, setModal]           = useState({ open: false })
  const [qrCodeUrl, setQrCodeUrl]   = useState('')
  const [qrLoading, setQrLoading]   = useState(false)

  useEffect(() => {
    if (method !== 'promptpay' || !amount || parseFloat(amount) <= 0) {
      setQrCodeUrl('')
      return
    }

    const delayDebounce = setTimeout(async () => {
      setQrLoading(true)
      try {
        const { ok, data } = await api.get(`/payment/promptpay-qr?amount=${amount}`)
        if (ok && data.status) {
          setQrCodeUrl(data.qr_image_url)
        } else {
          setQrCodeUrl('')
        }
      } catch (err) {
        console.error(err)
        setQrCodeUrl('')
      } finally {
        setQrLoading(false)
      }
    }, 400)

    return () => clearTimeout(delayDebounce)
  }, [amount, method])


  const submit = async () => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    setLoading(true)

    // -- Redeem code --
    if (method === 'redeem') {
      if (!redeemCode.trim()) { setLoading(false); return }
      const { ok, data } = await api.redeemCode(redeemCode)
      setLoading(false)
      if (ok && data.new_balance != null) {
        await refreshUser()
        setModal({ open: true, type: 'success', title: 'เติมเงินสำเร็จ!', message: data.message || 'เครดิตถูกเพิ่มแล้ว',
          action: { label: 'ดูโปรไฟล์', onClick: () => navigate('/profile') } })
      } else {
        setModal({ open: true, type: 'error', title: 'ไม่สำเร็จ', message: data.error || 'รหัสไม่ถูกต้อง' })
      }
      return
    }

    // -- TrueMoney ซองอั่งเป่า --
    if (method === 'truewallet') {
      const hash = extractAngpaoHash(angpaoUrl)
      if (!hash) { setLoading(false); return }
      const { ok, data } = await api.post('/payment/truemoney-angpao', { voucher_url: angpaoUrl })
      setLoading(false)
      if (ok && data.status) {
        await refreshUser()
        setAngpaoUrl('')
        setModal({ open: true, type: 'success', title: 'สำเร็จ!', message: data.message,
          action: { label: 'ดูประวัติ', onClick: () => navigate('/topup-logs') } })
      } else {
        setModal({ open: true, type: 'error', title: 'ไม่สำเร็จ', message: data.message || 'ซองอั่งเป่าไม่ถูกต้อง' })
      }
      return
    }

    // -- Slip flow (promptpay / bank) --
    if (!amount || !slip) { setLoading(false); return }

    const { ok: qrOk, data: qrData } = await api.topupQR({ amount: parseFloat(amount), payment_method: method })
    if (!qrOk || !qrData.ref_code) {
      setLoading(false)
      setModal({ open: true, type: 'error', title: 'ไม่สำเร็จ', message: qrData?.message || 'สร้างรายการไม่ได้' })
      return
    }

    const uploadData = await api.uploadSlip(qrData.ref_code, slip)
    setLoading(false)
    if (uploadData.status) {
      await refreshUser()
      setSlip(null); setAmount('')
      setModal({ open: true, type: 'success', title: 'ส่งสลิปสำเร็จ!', message: 'กำลังตรวจสอบ รอสักครู่',
        action: { label: 'ดูประวัติเติมเงิน', onClick: () => navigate('/topup-logs') } })
    } else {
      setModal({ open: true, type: 'error', title: 'อัพโหลดไม่สำเร็จ', message: uploadData.message || 'กรุณาลองใหม่' })
    }
  }

  const canSubmit = !loading && (() => {
    if (method === 'redeem')     return redeemCode.trim()
    if (method === 'truewallet') return angpaoUrl.trim()
    return amount && slip
  })()

  const submitLabel = () => {
    if (loading)                 return 'กำลังดำเนินการ...'
    if (method === 'redeem')     return 'ใช้รหัสเติมเงิน'
    if (method === 'truewallet') return 'ส่งซองอั่งเป่า'
    return 'ส่งสลิป'
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-12 w-full">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Wallet size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-black uppercase tracking-tight">เติมเงิน</h1>
          <p className="text-gray-500 text-sm mt-1">เพิ่มเครดิตเข้าบัญชีของคุณ</p>
        </div>

        <div className="bg-white rounded-2xl border-2 border-gray-100 overflow-hidden">
          <div className="p-6 space-y-6">

            {/* Method selector */}
            <div>
              <label className="block text-sm font-black uppercase tracking-wide text-black mb-3">ช่องทางชำระเงิน</label>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map(m => {
                  const Icon = m.icon
                  return (
                    <button key={m.value} onClick={() => setMethod(m.value)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all text-left ${
                        method === m.value ? 'border-black bg-black text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                      }`}>
                      <Icon size={16} /> {m.label}
                      {m.badge && <span className="ml-auto text-xs bg-white text-black px-1.5 py-0.5 rounded-full font-bold">{m.badge}</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Redeem code ── */}
            {method === 'redeem' && (
              <div>
                <label className="block text-sm font-black uppercase tracking-wide text-black mb-2">รหัสเติมเงิน</label>
                <input type="text" value={redeemCode} onChange={e => setRedeemCode(e.target.value)}
                  placeholder="กรอกรหัสที่นี่"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm transition-colors" />
              </div>
            )}

            {/* ── TrueMoney ซองอั่งเป่า ── */}
            {method === 'truewallet' && (
              <div className="space-y-4">
                {/* Info card */}
                <div className="flex items-start gap-4 p-4 bg-red-50 border-2 border-red-100 rounded-xl">
                  <span className="text-3xl">🧧</span>
                  <div>
                    <p className="font-black text-red-700 text-sm">TrueMoney Wallet ซองอั่งเป่า</p>
                    <p className="text-xs text-red-500 mt-1 leading-relaxed">
                      วางลิงก์ซองอั่งเป่าจาก TrueMoney Wallet<br />
                      ระบบจะเติมเครดิตตามมูลค่าซองอัตโนมัติ
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-black uppercase tracking-wide text-black mb-2">ลิงก์ซองอั่งเป่า</label>
                  <div className="relative">
                    <Link size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="url"
                      value={angpaoUrl}
                      onChange={e => setAngpaoUrl(e.target.value)}
                      placeholder="https://gift.truemoney.com/campaign/?v=..."
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-red-400 text-sm transition-colors font-mono"
                    />
                  </div>
                  {angpaoUrl && !angpaoUrl.includes('gift.truemoney.com') && (
                    <p className="text-xs text-amber-600 mt-1.5">⚠️ ควรเป็นลิงก์จาก gift.truemoney.com</p>
                  )}
                  {angpaoUrl && extractAngpaoHash(angpaoUrl) && (
                    <p className="text-xs text-green-600 mt-1.5">
                      ✓ รหัส: <span className="font-mono font-bold">{extractAngpaoHash(angpaoUrl)}</span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Slip upload (promptpay / bank) ── */}
            {(method === 'promptpay' || method === 'bank') && (
              <>
                {/* Amount */}
                <div>
                  <label className="block text-sm font-black uppercase tracking-wide text-black mb-2">จำนวนเงิน (บาท)</label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {QUICK.map(n => (
                      <button key={n} onClick={() => setAmount(String(n))}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
                          amount === String(n) ? 'border-black bg-black text-white' : 'border-gray-200 text-gray-600 hover:border-black'
                        }`}>
                        {n} ฿
                      </button>
                    ))}
                  </div>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    placeholder="หรือกรอกจำนวนเอง เช่น 150"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm transition-colors" />
                </div>

                {/* Bank info */}
                <div className="p-4 bg-[#F2F0F1] rounded-xl text-sm space-y-1.5">
                  <p className="font-black text-black uppercase tracking-wide text-xs mb-2">ข้อมูลบัญชี</p>
                  {method === 'promptpay' ? (
                    <div className="flex flex-col items-center justify-center py-2 gap-2">
                      {qrLoading ? (
                        <div className="w-48 h-48 flex items-center justify-center border-2 border-gray-200 border-dashed rounded-lg bg-gray-50">
                          <p className="text-xs text-gray-500 font-semibold animate-pulse">กำลังสร้าง QR Code...</p>
                        </div>
                      ) : qrCodeUrl ? (
                        <>
                          <img src={qrCodeUrl} alt="promptpay-qr" className="w-48 rounded-lg shadow-md border-2 border-black" />
                          <p className="text-xs text-green-600 font-bold mt-1 text-center">✓ QR Code สำหรับยอดโอน {parseFloat(amount).toFixed(2)} บาท</p>
                        </>
                      ) : (
                        <div className="w-48 h-48 flex flex-col items-center justify-center border-2 border-gray-200 border-dashed rounded-lg bg-gray-50 p-4 text-center">
                          <p className="text-xs text-amber-600 font-bold">ระบุจำนวนเงินโอน</p>
                          <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">กรอกยอดเงินด้านบน ระบบจะเจน QR Code ให้ท่านสแกนทันที</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-gray-600">พร้อมเพย์: <strong className="text-black">080-062-0646</strong></p>

                      <p className="text-gray-600">ชื่อ: <strong className="text-black">ธนกร โกฎิแก้ว</strong></p>
                      <div className="text-gray-600 flex items-center gap-2">
                        <span>ธนาคาร: <strong className="text-black">KBANK</strong></span>
                        <img src="/static/images/kbank-logo.png" alt="kbank logo" className="h-5 object-contain" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Slip upload */}
                <div>
                  <label className="block text-sm font-black uppercase tracking-wide text-black mb-2">อัพโหลดสลิปการโอน</label>
                  {slip ? (
                    <div className="flex items-center gap-3 p-4 border-2 border-black rounded-xl bg-[#F2F0F1]">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-black truncate">{slip.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{(slip.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button onClick={() => setSlip(null)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors shrink-0">
                        <X size={16} className="text-gray-600" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-black hover:bg-[#F2F0F1] transition-all text-gray-400 hover:text-black">
                      <Upload size={24} />
                      <div className="text-center">
                        <p className="text-sm font-semibold">คลิกเพื่อเลือกไฟล์สลิป</p>
                        <p className="text-xs mt-0.5">PNG, JPG ขนาดไม่เกิน 5MB</p>
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={e => setSlip(e.target.files[0])} />
                    </label>
                  )}
                </div>
              </>
            )}

            {/* Submit */}
            <button onClick={submit} disabled={!canSubmit}
              className={`w-full py-4 font-black rounded-xl transition-colors text-sm uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed text-white ${
                method === 'truewallet' ? 'bg-red-500 hover:bg-red-600' : 'bg-black hover:bg-gray-800'
              }`}>
              {submitLabel()}
            </button>

          </div>
        </div>
      </motion.div>

      <Modal {...modal} onClose={() => setModal({ open: false })} />
    </div>
  )
}

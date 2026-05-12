import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, ShoppingBag, UserPlus } from 'lucide-react'
import { api } from '../services/api'
import Modal from '../components/Modal'

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm]     = useState({ email: '', username: '', password: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('รหัสผ่านไม่ตรงกัน'); return }
    setLoading(true)
    const { ok, data } = await api.register({ email: form.email, username: form.username, password: form.password })
    setLoading(false)
    if (ok && (data.status || data.message === 'User registered successfully!')) {
      setSuccess(true)
    } else {
      setError(data.message || data.error || 'เกิดข้อผิดพลาด')
    }
  }

  const fields = [
    { key: 'email',    type: 'email',    label: 'อีเมล',        placeholder: 'you@example.com' },
    { key: 'username', type: 'text',     label: 'Username',      placeholder: 'กรอก username' },
    { key: 'password', type: showPw ? 'text' : 'password', label: 'รหัสผ่าน', placeholder: 'อย่างน้อย 6 ตัวอักษร', pw: true },
    { key: 'confirm',  type: showPw ? 'text' : 'password', label: 'ยืนยันรหัสผ่าน', placeholder: 'กรอกอีกครั้ง' },
  ]

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-10">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 bg-amber-500 rounded-2xl items-center justify-center mb-4 shadow-xl shadow-amber-500/30">
            <ShoppingBag size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">สร้างบัญชีใหม่</h1>
          <p className="text-slate-500 mt-1 text-sm">เริ่มต้นซื้อสินค้าดิจิทัลได้เลย</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {fields.map(({ key, type, label, placeholder, pw }) => (
              <div key={key}>
                <label className="block text-sm font-semibold text-slate-300 mb-2">{label}</label>
                <div className="relative">
                  <input
                    type={type}
                    value={form[key]}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    placeholder={placeholder}
                    required
                    className="w-full px-4 py-3 pr-11 bg-white/6 border border-white/12 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 text-sm transition-all"
                  />
                  {pw && (
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                </div>
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 text-sm mt-2"
            >
              {loading ? 'กำลังสมัคร...' : <><UserPlus size={16} /> สมัครสมาชิก</>}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            มีบัญชีแล้ว?{' '}
            <Link to="/login" className="text-amber-400 font-semibold hover:text-amber-300 transition-colors">
              เข้าสู่ระบบ →
            </Link>
          </p>
        </div>
      </motion.div>

      <Modal
        open={success}
        type="success"
        title="สมัครสมาชิกสำเร็จ!"
        message="บัญชีของคุณพร้อมใช้งานแล้ว"
        action={{ label: 'เข้าสู่ระบบเลย', onClick: () => navigate('/login') }}
        onClose={() => navigate('/login')}
      />
    </div>
  )
}

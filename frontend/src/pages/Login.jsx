import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, ShoppingBag, LogIn } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm]       = useState({ username: '', password: '' })
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const submit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { ok, message } = await login(form.username, form.password)
    setLoading(false)
    if (ok) navigate('/')
    else setError(message)
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 bg-amber-500 rounded-2xl items-center justify-center mb-4 shadow-xl shadow-amber-500/30">
            <ShoppingBag size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-white">ยินดีต้อนรับกลับ</h1>
          <p className="text-slate-500 mt-1 text-sm">เข้าสู่ระบบเพื่อเริ่มใช้งาน</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-sm">
          <form onSubmit={submit} className="space-y-5">

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Username</label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                placeholder="กรอก username"
                required
                className="w-full px-4 py-3 bg-white/6 border border-white/12 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 text-sm transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">รหัสผ่าน</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="กรอกรหัสผ่าน"
                  required
                  className="w-full px-4 py-3 pr-12 bg-white/6 border border-white/12 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15 text-sm transition-all"
                />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/35 text-sm"
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : <><LogIn size={16} /> เข้าสู่ระบบ</>}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            ยังไม่มีบัญชี?{' '}
            <Link to="/register" className="text-amber-400 font-semibold hover:text-amber-300 transition-colors">
              สมัครฟรี →
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, ShoppingBag, LogIn, ShieldCheck, ChevronDown } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { DiscordButton, GoogleButton, FacebookButton } from '../components/SocialButtons'

export default function Login() {
  const { login, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form, setForm]       = useState({ username: '', password: '' })
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [showAdmin, setShowAdmin] = useState(false)

  useEffect(() => {
    const token = searchParams.get('token')
    if (token) {
      localStorage.setItem('token', token)
      refreshUser().then(() => {
        navigate('/')
      })
    }
  }, [searchParams, navigate, refreshUser])

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
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 bg-[#F2F0F1] py-14">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 bg-black rounded-2xl items-center justify-center mb-4">
            <ShoppingBag size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-black uppercase tracking-tight">ยินดีต้อนรับกลับ</h1>
          <p className="text-gray-500 mt-1.5 text-sm">เข้าสู่ระบบเพื่อเริ่มใช้งาน</p>
        </div>

        <div className="bg-white border-2 border-gray-100 rounded-2xl p-8">
          {/* Primary: Social login */}
          <div className="space-y-3">
            <DiscordButton label="เข้าสู่ระบบด้วย Discord" onClick={() => window.location.href = '/api/auth/discord'} />
            <GoogleButton label="เข้าสู่ระบบด้วย Google" onClick={() => window.location.href = '/api/auth/google'} />
            <FacebookButton label="เข้าสู่ระบบด้วย Facebook" onClick={() => window.location.href = '/api/auth/facebook'} />
          </div>

          <p className="text-center text-sm text-gray-500 mt-6">
            ยังไม่มีบัญชี?{' '}
            <Link to="/register" className="text-black font-bold underline underline-offset-2 hover:text-gray-600 transition-colors">
              สมัครฟรี →
            </Link>
          </p>

          {/* Hidden: Master Admin login (collapsible) */}
          <div className="mt-6 pt-5 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setShowAdmin(v => !v)}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-black transition-colors cursor-pointer"
            >
              <ShieldCheck size={14} />
              เข้าสู่ระบบสำหรับ Master Admin
              <ChevronDown size={14} className={`transition-transform ${showAdmin ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence initial={false}>
              {showAdmin && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <form onSubmit={submit} className="space-y-4 pt-4" autoComplete="off">
                    {error && (
                      <div className="bg-red-50 border-2 border-red-100 rounded-xl px-4 py-3 text-red-600 text-sm font-medium">
                        {error}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-black uppercase tracking-wide text-black mb-2">Username</label>
                      <input
                        type="text"
                        value={form.username}
                        onChange={e => setForm({ ...form, username: e.target.value })}
                        placeholder="กรอก username"
                        autoComplete="off"
                        className="w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-xl text-black placeholder:text-gray-400 focus:outline-none focus:border-black text-sm transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase tracking-wide text-black mb-2">รหัสผ่าน</label>
                      <div className="relative">
                        <input
                          type={showPw ? 'text' : 'password'}
                          value={form.password}
                          onChange={e => setForm({ ...form, password: e.target.value })}
                          placeholder="กรอกรหัสผ่าน"
                          autoComplete="new-password"
                          className="w-full px-4 py-3 pr-12 bg-white border-2 border-gray-200 rounded-xl text-black placeholder:text-gray-400 focus:outline-none focus:border-black text-sm transition-colors"
                        />
                        <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors">
                          {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-black hover:bg-gray-800 disabled:opacity-50 text-white font-bold rounded-full transition-colors text-sm"
                    >
                      {loading ? 'กำลังเข้าสู่ระบบ...' : <><LogIn size={16} /> เข้าสู่ระบบ Admin</>}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

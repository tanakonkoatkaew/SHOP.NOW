import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, ShoppingBag, LogIn, ShieldCheck, ChevronDown } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'


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
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-10">
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
          {/* Primary: Social login */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => window.location.href = '/api/auth/discord'}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#5865F2]/20 hover:shadow-[#5865F2]/35 text-sm cursor-pointer"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.8528 2.0908 5.645 3.3524 8.384 4.2045a.076.076 0 00.0829-.027c.6425-.879 1.21-1.815 1.6873-2.7984a.0747.0747 0 00-.0408-.103c-.901-.341-1.758-.7677-2.5732-1.2678a.0778.0778 0 01-.0077-.1286c.171-.128.342-.262.505-.3986a.0773.0773 0 01.0807-.011c5.522 2.53 11.603 2.53 17.065 0a.077.077 0 01.0818.01c.163.138.334.271.505.3996a.0778.0778 0 01-.0067.1287c-.815.5002-1.672.9268-2.573 1.2678a.0747.0747 0 00-.041.103c.484.9928 1.05 1.9284 1.691 2.8074a.076.076 0 00.083.027c2.748-.852 5.541-2.1137 8.394-4.2045a.0802.0802 0 00.031-.0559c.491-5.1764-.813-9.6738-3.541-13.722a.0664.0664 0 00-.032-.0277zM8.02 15.33c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9559-2.4189 2.157-2.4189 1.2108 0 2.1757 1.095 2.1568 2.419 0 1.3332-.9559 2.4189-2.1569 2.4189zm7.975 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.211 0 2.1756 1.095 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
              </svg>
              เข้าสู่ระบบด้วย Discord
            </button>

            <button
              type="button"
              onClick={() => window.location.href = '/api/auth/google'}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl transition-all shadow-lg shadow-white/5 hover:shadow-white/10 text-sm border border-slate-200 cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              เข้าสู่ระบบด้วย Google
            </button>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            ยังไม่มีบัญชี?{' '}
            <Link to="/register" className="text-amber-400 font-semibold hover:text-amber-300 transition-colors">
              สมัครฟรี →
            </Link>
          </p>

          {/* Hidden: Master Admin login (collapsible) */}
          <div className="mt-6 pt-5 border-t border-white/10">
            <button
              type="button"
              onClick={() => setShowAdmin(v => !v)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
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
                        autoComplete="off"
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
                          autoComplete="new-password"
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
                      className="w-full flex items-center justify-center gap-2 py-3 bg-white/10 hover:bg-white/15 disabled:opacity-60 text-white font-bold rounded-xl transition-all text-sm border border-white/10"
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

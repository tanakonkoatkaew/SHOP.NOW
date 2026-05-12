import { useState, useEffect, createContext, useContext } from 'react'
import { api } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    api.me().then(({ ok, data }) => {
      if (ok && data.user) setUser(data.user)
      else localStorage.removeItem('token')
    }).finally(() => setLoading(false))
  }, [])

  const login = async (username, password) => {
    const { ok, data } = await api.login({ username, password })
    if (ok && data.token) {
      localStorage.setItem('token', data.token)
      const me = await api.me()
      if (me.ok && me.data.user) setUser(me.data.user)
      return { ok: true }
    }
    return { ok: false, message: data.message || data.error || 'เข้าสู่ระบบไม่สำเร็จ' }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  const refreshUser = async () => {
    const { ok, data } = await api.me()
    if (ok && data.user) setUser(data.user)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

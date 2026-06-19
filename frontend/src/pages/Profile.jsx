import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Mail, Phone, Wallet, Star, History, CreditCard, Edit2, Check, X, MessageSquare, Link as LinkIcon, Camera } from 'lucide-react'
import { api } from '../services/api'
import Spinner from '../components/Spinner'
import { useAuth } from '../hooks/useAuth'

export default function Profile() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [isSaving, setIsSaving] = useState(false)

  const loadProfile = () => {
    api.profile().then(({ ok, data }) => {
      if (ok && data.data) {
        setProfile(data.data)
        setEditForm({
          username: data.data.username || '',
          phone: data.data.phone || '',
          avatar: data.data.avatar || '',
          discord_id: data.data.discord_id || '',
          line_id: data.data.line_id || ''
        })
      }
      setLoading(false)
    })
  }

  useEffect(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    loadProfile()
  }, [navigate])

  const handleSave = async () => {
    if (!editForm.username?.trim()) return alert("Username ต้องไม่ว่างเปล่า")
    setIsSaving(true)
    const { ok, data } = await api.updateProfile(editForm)
    if (ok && data.status) {
      setIsEditing(false)
      loadProfile()
      refreshUser() // Update global user state (username, avatar)
    } else {
      alert(data?.message || 'เกิดข้อผิดพลาด')
    }
    setIsSaving(false)
  }

  if (loading) return <Spinner />

  const fields = [
    { icon: User,  label: 'Username', key: 'username', value: profile?.username },
    { icon: Mail,  label: 'อีเมล',    key: 'email',    value: profile?.email, readonly: true },
    { icon: Phone, label: 'โทรศัพท์', key: 'phone',    value: profile?.phone || '—' },
    { icon: MessageSquare, label: 'Discord Webhook URL', key: 'discord_id', value: profile?.discord_id || '—' },

    { icon: LinkIcon, label: 'LINE ID', key: 'line_id', value: profile?.line_id || '—' },
  ]

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 w-full">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

        {/* Avatar header */}
        <div className="text-center mb-8 relative">
          <div className="w-24 h-24 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl shadow-amber-200 overflow-hidden relative group">
            {profile?.avatar ? (
              <img src={profile.avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-black text-white">
                {profile?.username?.[0]?.toUpperCase() || 'U'}
              </span>
            )}
            {isEditing && (
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center transition-opacity">
                <Camera size={24} className="text-white mb-1 drop-shadow-md" />
              </div>
            )}
          </div>
          
          {isEditing ? (
            <div className="mb-4 max-w-xs mx-auto">
              <input
                type="text"
                placeholder="วาง URL รูปโปรไฟล์ (ถ้ามี)"
                value={editForm.avatar}
                onChange={e => setEditForm({...editForm, avatar: e.target.value})}
                className="w-full text-center text-sm px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-amber-400 focus:bg-white transition-colors"
              />
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-black text-slate-900">{profile?.username}</h1>
              <p className="text-slate-500 text-sm mt-1">สมาชิก ShopNow</p>
            </>
          )}

          {!isEditing ? (
            <button 
              onClick={() => setIsEditing(true)}
              className="absolute right-0 top-0 text-amber-500 hover:text-amber-600 hover:bg-amber-50 px-3 py-2 rounded-xl transition-colors flex items-center gap-2 text-sm font-semibold"
            >
              <Edit2 size={16} /> <span className="hidden sm:inline">แก้ไขโปรไฟล์</span>
            </button>
          ) : (
            <div className="absolute right-0 top-0 flex gap-2">
              <button 
                onClick={() => {
                  setIsEditing(false)
                  setEditForm({
                    username: profile.username || '',
                    phone: profile.phone || '',
                    avatar: profile.avatar || '',
                    discord_id: profile.discord_id || '',
                    line_id: profile.line_id || ''
                  })
                }}
                className="text-slate-500 hover:bg-slate-100 p-2.5 rounded-full transition-colors bg-white shadow-sm border border-slate-200"
                disabled={isSaving}
              >
                <X size={18} />
              </button>
              <button 
                onClick={handleSave}
                className="text-white bg-amber-500 hover:bg-amber-600 p-2.5 rounded-full transition-colors shadow-sm"
                disabled={isSaving}
              >
                {isSaving ? <Spinner className="w-4 h-4" /> : <Check size={18} />}
              </button>
            </div>
          )}
        </div>

        {/* Balance cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-5 text-white shadow-lg shadow-amber-200">
            <Wallet size={20} className="mb-3 opacity-80" />
            <p className="text-xs font-semibold opacity-75 mb-1">เครดิตคงเหลือ</p>
            <p className="text-3xl font-black">{parseFloat(profile?.credit || 0).toFixed(2)}</p>
            <p className="text-xs opacity-75">บาท</p>
          </div>
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white shadow-lg shadow-slate-200">
            <Star size={20} className="mb-3 opacity-80 text-amber-400" />
            <p className="text-xs font-semibold opacity-75 mb-1">Reward Points</p>
            <p className="text-3xl font-black">{parseFloat(profile?.reward || 0).toFixed(2)}</p>
            <p className="text-xs opacity-75">คะแนน</p>
          </div>
        </div>

        {/* Info card */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6 shadow-sm">
          {fields.map(({ icon: Icon, label, key, value, readonly }, i) => (
            <div key={label} className={`flex items-center gap-4 px-6 py-4 ${i < fields.length - 1 ? 'border-b border-slate-100' : ''}`}>
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center shrink-0 border border-slate-100">
                <Icon size={18} className="text-slate-500" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                {isEditing && !readonly ? (
                  <input
                    type="text"
                    value={editForm[key]}
                    onChange={e => setEditForm({...editForm, [key]: e.target.value})}
                    className="w-full text-sm font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-400 focus:bg-white transition-colors"
                    placeholder={`กรอก ${label}`}
                  />
                ) : (
                  <p className="font-semibold text-slate-800 text-sm">{value}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/purchase-logs" className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl hover:border-amber-300 hover:bg-amber-50 hover:shadow-md hover:shadow-amber-100 transition-all group">
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-white transition-colors">
              <History size={18} className="text-slate-400 group-hover:text-amber-500" />
            </div>
            <span className="text-sm font-semibold text-slate-700">ประวัติการซื้อ</span>
          </Link>
          <Link to="/topup-logs" className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl hover:border-amber-300 hover:bg-amber-50 hover:shadow-md hover:shadow-amber-100 transition-all group">
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-white transition-colors">
              <CreditCard size={18} className="text-slate-400 group-hover:text-amber-500" />
            </div>
            <span className="text-sm font-semibold text-slate-700">ประวัติเติมเงิน</span>
          </Link>
        </div>

      </motion.div>
    </div>
  )
}

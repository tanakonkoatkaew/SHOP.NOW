import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'

const WELCOME_MSG = {
  id: 'welcome',
  sender: 'bot',
  text: 'สวัสดีครับ 👋 ผมคือ AI ผู้ช่วยของ SHOP.NOW\nสอบถามได้ทุกเรื่องเลยครับ เช่น หาสินค้า เช็คราคา เช็คเครดิต ดูออเดอร์ วิธีสั่งซื้อ ฯลฯ\n\nหรือแตะคำถามด่วนด้านล่างได้เลย',
  created_at: '',
}

function formatTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function Bubble({ msg }) {
  const isUser = msg.sender === 'user'
  const isBot  = msg.sender === 'bot'

  const wrap  = isUser ? 'justify-end' : 'justify-start'
  const color = isUser
    ? 'bg-black text-white rounded-2xl rounded-br-md'
    : isBot
      ? 'bg-[#F2F0F1] text-black rounded-2xl rounded-bl-md'
      : 'bg-white border-2 border-black text-black rounded-2xl rounded-bl-md'

  return (
    <div className={`flex ${wrap} mb-2`}>
      <div className="flex flex-col max-w-[85%]">
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            {isBot ? <><Sparkles size={11} /> AI Assistant</> : <><ShieldCheck size={11} /> แอดมิน</>}
          </div>
        )}
        <div className={`${color} px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words`}>
          {msg.text}
        </div>
        {msg.created_at && (
          <span className="text-[10px] text-gray-400 mt-0.5 px-1 self-end">{formatTime(msg.created_at)}</span>
        )}
      </div>
    </div>
  )
}

function TypingBubble() {
  return (
    <div className="flex justify-start mb-2">
      <div className="flex flex-col max-w-[85%]">
        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
          <Sparkles size={11} /> AI Assistant
        </div>
        <div className="bg-[#F2F0F1] text-black rounded-2xl rounded-bl-md px-3.5 py-2.5">
          <span className="inline-flex gap-1">
            {[0, 1, 2].map(i => (
              <span key={i}
                className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function ChatWidget() {
  const { user } = useAuth()
  const location = useLocation()
  const [open, setOpen]         = useState(false)
  const [tab, setTab]           = useState('ai') // 'ai' | 'admin'
  const [faq, setFaq]           = useState([])
  const [messages, setMessages] = useState([])
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const scrollRef = useRef(null)
  const pollRef   = useRef(null)

  const aiMessages    = messages.filter(m => m.channel !== 'admin')
  const adminMessages = messages.filter(m => m.channel === 'admin')
  const shown         = tab === 'ai' ? aiMessages : adminMessages

  // load FAQ once (used as quick-question chips)
  useEffect(() => {
    api.chat.faq().then(({ data }) => setFaq(data?.results || []))
  }, [])

  const loadMessages = useCallback(async () => {
    if (!user) return
    const { ok, data } = await api.chat.messages()
    if (ok) setMessages(data.results || [])
  }, [user])

  // load + poll while the panel is open (picks up admin replies)
  useEffect(() => {
    if (open && user) {
      loadMessages()
      pollRef.current = setInterval(loadMessages, 5000)
      return () => clearInterval(pollRef.current)
    }
  }, [open, user, loadMessages])

  // auto-scroll on new messages / typing indicator / tab switch
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, sending, open, tab])

  const sendText = async (raw) => {
    const t = (raw ?? text).trim()
    if (!t || sending || !user) return
    setSending(true)
    const channel = tab === 'admin' ? 'admin' : 'ai'
    const now = new Date().toISOString()
    setMessages(m => [...m, { id: 'tmp-' + Date.now(), sender: 'user', text: t, channel, created_at: now }])
    setText('')
    const opts = channel === 'admin' ? { channel: 'admin', skip_bot: true } : {}
    const { ok, data } = await api.chat.send(t, opts)
    if (ok && data.bot_reply) {
      setMessages(m => [...m, data.bot_reply])
    }
    setSending(false)
    loadMessages()
  }

  // Quick-question chip: logged-in users get the canned FAQ answer instantly
  // (saved to history); guests get it appended locally.
  const handleFaq = async (item) => {
    if (sending) return
    if (!user) {
      setMessages(m => [
        ...m,
        { id: 'q-' + Date.now(), sender: 'user', text: item.q, channel: 'ai', created_at: new Date().toISOString() },
        { id: 'a-' + Date.now(), sender: 'bot',  text: item.a, channel: 'ai', created_at: new Date().toISOString() },
      ])
      return
    }
    const { ok, data } = await api.chat.faqAnswer(item.id)
    if (ok) {
      setMessages(m => [...m, data.question, data.answer])
    }
  }

  // Hide widget on admin page — admins handle chats via the admin panel
  if (location.pathname.startsWith('/admin')) return null

  return (
    <>
      {/* Floating launcher */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-40 h-14 pl-4 pr-5 bg-black text-white rounded-full shadow-2xl hover:bg-gray-800 flex items-center gap-2 transition-colors"
            aria-label="เปิดแชทผู้ช่วย"
          >
            <span className="relative">
              <MessageCircle size={24} />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
            </span>
            <span className="text-sm font-bold hidden sm:inline">ถาม AI</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{    opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-1.5rem)] h-[560px] max-h-[calc(100vh-3rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-black text-white px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
                  {tab === 'ai' ? <Sparkles size={16} /> : <ShieldCheck size={16} />}
                </div>
                <div>
                  <p className="font-black text-sm uppercase tracking-tight">
                    {tab === 'ai' ? 'AI Assistant' : 'แชทกับแอดมิน'}
                  </p>
                  <p className="text-[10px] text-gray-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />
                    {tab === 'ai' ? 'ออนไลน์ · ตอบทันที' : 'ทีมงานตอบโดยเร็วที่สุด'}
                  </p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" aria-label="ปิดแชท">
                <X size={16} />
              </button>
            </div>

            {/* Channel tabs */}
            <div className="flex border-b border-gray-100 shrink-0">
              <button onClick={() => setTab('ai')}
                className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  tab === 'ai' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-black'
                }`}>
                <Sparkles size={13} /> ถาม AI
              </button>
              <button onClick={() => setTab('admin')}
                className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  tab === 'admin' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-black'
                }`}>
                <ShieldCheck size={13} /> แอดมิน
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 bg-gray-50/50">
              {tab === 'ai' ? (
                <>
                  <Bubble msg={WELCOME_MSG} />
                  {shown.map(m => <Bubble key={m.id} msg={m} />)}
                  {sending && <TypingBubble />}
                </>
              ) : (
                <>
                  {shown.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-sm px-4">
                      <ShieldCheck size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="font-semibold text-gray-500">แชทตรงถึงทีมงาน — ไม่มี AI ตอบ</p>
                      <p className="text-xs mt-1">ฝากข้อความไว้ได้เลย แอดมินจะตอบกลับโดยเร็วที่สุด</p>
                    </div>
                  )}
                  {shown.map(m => <Bubble key={m.id} msg={m} />)}
                </>
              )}
            </div>

            {/* Quick questions — AI tab only */}
            {tab === 'ai' && (
              <div className="shrink-0 border-t border-gray-100 bg-white px-2.5 pt-2">
                <div className="flex gap-1.5 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {faq.map(item => (
                    <button key={item.id} onClick={() => handleFaq(item)} disabled={sending}
                      className="shrink-0 px-3 py-1.5 border-2 border-gray-200 rounded-full text-xs font-semibold text-gray-700 hover:border-black hover:text-black disabled:opacity-40 transition-colors">
                      {item.q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-gray-100 p-2.5 shrink-0 bg-white">
              {!user ? (
                <Link to="/login" onClick={() => setOpen(false)}
                  className="block w-full text-center py-2.5 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors">
                  เข้าสู่ระบบเพื่อเริ่มแชท →
                </Link>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea
                    id="chat-input"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendText()
                      }
                    }}
                    rows={1}
                    placeholder={tab === 'ai'
                      ? 'พิมพ์คำถามได้เลย เช่น มีเกมอะไรลดราคาบ้าง'
                      : 'พิมพ์ข้อความถึงแอดมิน...'}
                    className="flex-1 resize-none px-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm transition-colors max-h-32"
                  />
                  <button onClick={() => sendText()} disabled={!text.trim() || sending}
                    className="p-2.5 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 transition-colors shrink-0"
                    aria-label="ส่งข้อความ">
                    <Send size={16} />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

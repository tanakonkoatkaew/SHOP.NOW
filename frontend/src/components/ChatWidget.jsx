import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Send, Bot, ShieldCheck, Sparkles } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../hooks/useAuth'

function formatTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function Bubble({ msg }) {
  const isUser  = msg.sender === 'user'
  const isBot   = msg.sender === 'bot'
  const isAdmin = msg.sender === 'admin'

  const wrap  = isUser ? 'justify-end' : 'justify-start'
  const color = isUser
    ? 'bg-black text-white rounded-2xl rounded-br-md'
    : isAdmin
      ? 'bg-white border-2 border-black text-black rounded-2xl rounded-bl-md'
      : 'bg-[#F2F0F1] text-black rounded-2xl rounded-bl-md'

  return (
    <div className={`flex ${wrap} mb-2`}>
      <div className="flex flex-col max-w-[80%]">
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            {isBot ? <><Bot size={11} /> Bot</> : <><ShieldCheck size={11} /> แอดมิน</>}
          </div>
        )}
        <div className={`${color} px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words`}>
          {msg.text}
        </div>
        <span className="text-[10px] text-gray-400 mt-0.5 px-1 self-end">{formatTime(msg.created_at)}</span>
      </div>
    </div>
  )
}

export default function ChatWidget() {
  const { user } = useAuth()
  const location = useLocation()
  const [open, setOpen]         = useState(false)
  const [faq, setFaq]           = useState([])
  const [messages, setMessages] = useState([])
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [view, setView]         = useState('faq') // 'faq' | 'chat'
  const scrollRef = useRef(null)
  const pollRef   = useRef(null)

  // load FAQ once
  useEffect(() => {
    api.chat.faq().then(({ data }) => setFaq(data?.results || []))
  }, [])

  // load messages when chat view opens for logged-in user
  const loadMessages = useCallback(async () => {
    if (!user) return
    const { ok, data } = await api.chat.messages()
    if (ok) setMessages(data.results || [])
  }, [user])

  useEffect(() => {
    if (open && view === 'chat' && user) {
      loadMessages()
      pollRef.current = setInterval(loadMessages, 5000)
      return () => clearInterval(pollRef.current)
    }
  }, [open, view, user, loadMessages])

  // auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, view])

  const sendMessage = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    const now = new Date().toISOString()
    setMessages(m => [...m, { id: 'tmp-' + Date.now(), sender: 'user', text: t, created_at: now }])
    setText('')
    const { ok, data } = await api.chat.send(t)
    if (ok && data.bot_reply) {
      setMessages(m => [...m, data.bot_reply])
    }
    setSending(false)
    loadMessages()
  }

  const handleFaq = async (item) => {
    if (!user) {
      // not logged in — just append locally, no persistence
      setMessages(m => [
        ...m,
        { id: 'q-' + Date.now(),  sender: 'user', text: item.q, created_at: new Date().toISOString() },
        { id: 'a-' + Date.now(),  sender: 'bot',  text: item.a, created_at: new Date().toISOString() },
      ])
      setView('chat')
      return
    }
    setView('chat')
    const { ok, data } = await api.chat.faqAnswer(item.id)
    if (ok) {
      setMessages(m => [...m, data.question, data.answer])
    }
  }

  const requestAdmin = () => {
    if (!user) return
    setView('chat')
    setText('คุยกับแอดมิน')
    setTimeout(() => {
      const el = document.getElementById('chat-input')
      if (el) el.focus()
    }, 50)
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
            className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-black text-white rounded-full shadow-2xl hover:bg-gray-800 flex items-center justify-center transition-colors"
            aria-label="เปิดแชท"
          >
            <MessageCircle size={24} />
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
                  <Sparkles size={16} />
                </div>
                <div>
                  <p className="font-black text-sm uppercase tracking-tight">ช่วยเหลือลูกค้า</p>
                  <p className="text-[10px] text-gray-400">ตอบทันทีโดย Bot · มีแอดมินคอยช่วย</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 shrink-0">
              <button onClick={() => setView('faq')}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                  view === 'faq' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-black'
                }`}>
                คำถามที่พบบ่อย
              </button>
              <button onClick={() => setView('chat')}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                  view === 'chat' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-black'
                }`}>
                แชท
              </button>
            </div>

            {/* Body */}
            {view === 'faq' ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <p className="text-xs text-gray-500 mb-2">เลือกหัวข้อที่ต้องการ — Bot จะตอบให้ทันที</p>
                {faq.map(item => (
                  <button key={item.id} onClick={() => handleFaq(item)}
                    className="w-full text-left px-4 py-3 border-2 border-gray-100 hover:border-black rounded-xl text-sm font-semibold transition-all group">
                    <div className="flex items-center justify-between gap-2">
                      <span>{item.q}</span>
                      <span className="text-gray-300 group-hover:text-black transition-colors">→</span>
                    </div>
                  </button>
                ))}
                {user && (
                  <button onClick={requestAdmin}
                    className="w-full text-left px-4 py-3 mt-3 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors flex items-center gap-2">
                    <ShieldCheck size={14} /> คุยกับแอดมินโดยตรง
                  </button>
                )}
                {!user && (
                  <div className="mt-3 p-3 bg-[#F2F0F1] rounded-xl text-xs text-gray-600">
                    💡 <span className="font-semibold">เข้าสู่ระบบ</span> เพื่อคุยกับแอดมินและเก็บประวัติแชท
                  </div>
                )}
              </div>
            ) : (
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 bg-gray-50/50">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    <Bot size={32} className="mx-auto mb-2 opacity-50" />
                    <p>เริ่มต้นสนทนาได้เลย!</p>
                    <p className="text-xs mt-1">พิมพ์คำถามด้านล่าง หรือเลือกจากคำถามที่พบบ่อย</p>
                  </div>
                ) : (
                  messages.map(m => <Bubble key={m.id} msg={m} />)
                )}
              </div>
            )}

            {/* Input — only visible in chat view */}
            {view === 'chat' && (
              <div className="border-t border-gray-100 p-2.5 shrink-0 bg-white">
                {!user ? (
                  <div className="text-center py-2 text-xs text-gray-500">
                    เข้าสู่ระบบเพื่อส่งข้อความถึงแอดมิน
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      id="chat-input"
                      value={text}
                      onChange={e => setText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          sendMessage()
                        }
                      }}
                      rows={1}
                      placeholder="พิมพ์ข้อความ..."
                      className="flex-1 resize-none px-3 py-2 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-black text-sm transition-colors max-h-32"
                    />
                    <button onClick={sendMessage} disabled={!text.trim() || sending}
                      className="p-2.5 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 transition-colors shrink-0">
                      <Send size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

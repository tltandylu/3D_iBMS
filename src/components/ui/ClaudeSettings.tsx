import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'

export const LS_API_KEY    = 'CLAUDE_API_KEY'
export const LS_MODEL      = 'CLAUDE_MODEL'
export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export function getStoredApiKey(): string | undefined {
  return localStorage.getItem(LS_API_KEY) ||
    (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined) ||
    undefined
}
export function getStoredModel(): string {
  return localStorage.getItem(LS_MODEL) ?? DEFAULT_MODEL
}

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5  (快速 · 低成本)' },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6 (均衡)' },
  { id: 'claude-opus-4-7',           label: 'Opus 4.7   (最強 · 最慢)' },
]

interface Props { onClose: () => void }

export function ClaudeSettings({ onClose }: Props) {
  const [key,        setKey]        = useState(localStorage.getItem(LS_API_KEY) ?? '')
  const [model,      setModel]      = useState(localStorage.getItem(LS_MODEL) ?? DEFAULT_MODEL)
  const [showKey,    setShowKey]    = useState(false)
  const [testing,    setTesting]    = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const saved       = localStorage.getItem(LS_API_KEY) ?? ''
  const isConfigured = !!saved
  const maskedKey   = saved ? `${saved.slice(0, 10)}…${saved.slice(-4)}` : ''

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleSave = () => {
    const trimmed = key.trim()
    if (trimmed) localStorage.setItem(LS_API_KEY, trimmed)
    else         localStorage.removeItem(LS_API_KEY)
    localStorage.setItem(LS_MODEL, model)
    onClose()
  }

  const handleClear = () => {
    setKey('')
    setTestResult(null)
  }

  const handleTest = useCallback(async () => {
    const k = key.trim()
    if (!k) return
    setTesting(true)
    setTestResult(null)
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': k,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-allow-browser': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })
      if (resp.ok) {
        setTestResult({ ok: true, msg: '連接成功，API Key 有效' })
      } else {
        const txt = await resp.text()
        let msg = txt
        try { msg = JSON.parse(txt).error?.message ?? txt } catch { /* */ }
        setTestResult({ ok: false, msg: `HTTP ${resp.status}: ${msg.slice(0, 100)}` })
      }
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) })
    } finally {
      setTesting(false)
    }
  }, [key, model])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)' }} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 1,
          width: 468,
          background: 'rgba(7,15,30,0.99)',
          border: '1px solid rgba(16,185,129,0.28)',
          borderRadius: 12,
          padding: '24px 26px',
          boxShadow: '0 24px 72px rgba(0,0,0,0.72), 0 0 50px rgba(16,185,129,0.06)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div style={{ width: 3, height: 18, background: '#10b981', borderRadius: 2 }} />
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: 700 }}>
            Claude API 設定
          </span>
          {isConfigured && (
            <span style={{
              marginLeft: 8,
              padding: '2px 8px',
              background: 'rgba(16,185,129,0.12)',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 3,
              color: '#10b981', fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
            }}>
              ● 已設定 · {maskedKey}
            </span>
          )}
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
          >✕</button>
        </div>

        {/* API Key input */}
        <FieldLabel>ANTHROPIC API KEY</FieldLabel>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={key}
            onChange={e => { setKey(e.target.value); setTestResult(null) }}
            placeholder="sk-ant-api03-…"
            style={{
              width: '100%', padding: '8px 40px 8px 12px', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6, color: 'rgba(255,255,255,0.85)',
              fontSize: 12, outline: 'none', fontFamily: 'monospace',
            }}
          />
          <button
            onClick={() => setShowKey(v => !v)}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.75)', fontSize: 13, cursor: 'pointer',
            }}
          >
            {showKey ? '🙈' : '👁'}
          </button>
        </div>

        {/* Model selector */}
        <FieldLabel>模型選擇</FieldLabel>
        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6, color: 'rgba(255,255,255,0.8)',
            fontSize: 11, outline: 'none', marginBottom: 18, cursor: 'pointer',
          }}
        >
          {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>

        {/* Test result banner */}
        {testResult && (
          <div style={{
            marginBottom: 14, padding: '8px 12px',
            background: testResult.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${testResult.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            borderRadius: 5,
            color: testResult.ok ? '#6ee7b7' : '#fca5a5',
            fontSize: 10, lineHeight: 1.5,
          }}>
            {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
          </div>
        )}

        {/* Hint */}
        <div style={{
          marginBottom: 20, padding: '8px 12px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 5,
          color: 'rgba(255,255,255,0.65)', fontSize: 9, lineHeight: 1.8,
        }}>
          API Key 儲存於瀏覽器 localStorage，不會上傳至任何伺服器。<br />
          前端直接呼叫 api.anthropic.com（需瀏覽器 CORS 允許）。<br />
          環境變數 <code style={{ color: '#67e8f9' }}>VITE_ANTHROPIC_API_KEY</code> 仍可作為備用，此處設定優先。
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleTest}
            disabled={!key.trim() || testing}
            style={{
              padding: '8px 16px',
              background: key.trim() && !testing ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${key.trim() && !testing ? 'rgba(6,182,212,0.35)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 6,
              color: key.trim() && !testing ? '#67e8f9' : 'rgba(255,255,255,0.2)',
              fontSize: 11, cursor: key.trim() && !testing ? 'pointer' : 'not-allowed',
            }}
          >
            {testing ? '測試中…' : '測試連線'}
          </button>
          <button
            onClick={handleClear}
            style={{
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.75)', fontSize: 11, cursor: 'pointer',
            }}
          >
            清除
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 1, padding: '8px 0',
              background: 'rgba(16,185,129,0.16)',
              border: '1px solid rgba(16,185,129,0.42)',
              borderRadius: 6,
              color: '#10b981', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            儲存
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: 'rgba(255,255,255,0.75)', fontSize: 8.5,
      letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6,
    }}>
      {children}
    </div>
  )
}

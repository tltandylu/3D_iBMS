import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const EXAMPLE_QUERIES = [
  'A棟本週故障最多的設備？',
  '目前有哪些 CRITICAL 告警影響需量？',
  '哪些設備的 RUL 小於 90 天？',
  '3F 空調今日維修了幾次？',
]

const MOCK_RESPONSES: Record<string, string> = {
  'A棟本週故障最多的設備？':
    '📊 A棟本週故障排名：\n1. AHU-A-3F-01（3次，最近：高壓保護跳脫）\n2. UPS-A-2F-01（1次，電池溫度異常）\n\n建議對 AHU-A-3F-01 進行深度維護。',
  '目前有哪些 CRITICAL 告警影響需量？':
    '🔴 2 筆 CRITICAL 告警影響需量：\n• AHU-A-3F-01 停機 → 補償約 +42 kW\n• CRAC-C-1F-01 離線 → 機房轉移 +15 kW\n\n需量目前 87.5%，建議執行卸載計畫。',
  '哪些設備的 RUL 小於 90 天？':
    '⏱ RUL < 90 天設備：\n1. CRAC-C-1F-01 — 已超期（緊急！）\n2. AHU-A-3F-01 — 剩餘 45 天\n\n建議立即排定 C棟精密空調更換計畫。',
  '3F 空調今日維修了幾次？':
    '🔧 AHU-A-3F-01 今日記錄：\n• 1 筆 EM 工單進行中（WO-2026-001234）\n• 派工：陳大維，預估 3 小時\n• 本月累計 3 次，費用 NT$ 12,500',
}

import { getStoredApiKey, getStoredModel } from './ClaudeSettings'
import { getSystemSettings } from '../../hooks/useSystemSettings'

async function callClaudeNL(question: string): Promise<string> {
  const apiKey = getStoredApiKey()
  if (!apiKey) return MOCK_RESPONSES[question] ?? `🤖 已收到查詢「${question}」。\n\n此為 Demo 模式，點擊「⚙ 系統設定 → AI助理」輸入 Anthropic API Key 後將連接 Claude AI 進行 NL2Cypher 跨模組分析。`

  const { maxTokens, systemPrompt } = getSystemSettings().ai

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
    },
    body: JSON.stringify({
      model: getStoredModel(),
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
    }),
  })

  if (!resp.ok) throw new Error(`API ${resp.status}`)
  const data = await resp.json() as { content: Array<{ type: string; text: string }> }
  return data.content.find(c => c.type === 'text')?.text ?? '（無回應）'
}

export function NLQueryBar() {
  const [query, setQuery]       = useState('')
  const [response, setResponse] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleQuery = async (q: string) => {
    setQuery(q)
    setExpanded(true)
    setIsLoading(true)
    setResponse(null)
    try {
      const res = await callClaudeNL(q)
      setResponse(res)
    } catch (e) {
      setResponse(`⚠ 查詢失敗：${String(e)}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) handleQuery(query.trim())
  }

  return (
    <div style={{
      position: 'absolute', bottom: 48, left: '50%',
      transform: 'translateX(-50%)', width: 500, zIndex: 150,
    }}>
      {/* 查詢結果浮窗 */}
      <AnimatePresence>
        {expanded && (response || isLoading) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            style={{
              marginBottom: 6, padding: '10px 14px',
              background: 'rgba(4,12,24,0.95)',
              border: '1px solid rgba(6,182,212,0.25)',
              borderRadius: 8, backdropFilter: 'blur(16px)',
              maxHeight: 180, overflowY: 'auto', position: 'relative',
            }}
          >
            {isLoading ? (
              <div style={{ color: '#06b6d4', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                {getStoredApiKey() ? 'Claude AI 分析中…' : 'AI 分析中…'}
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 11, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                {getStoredApiKey() && <span style={{ color: '#10b981', fontSize: 8, fontWeight: 700, display: 'block', marginBottom: 4 }}>Claude AI · NL2Cypher</span>}
                {response}
              </div>
            )}
            <button
              onClick={() => { setExpanded(false); setResponse(null) }}
              style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer' }}
            >✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 輸入框 */}
      <form onSubmit={handleSubmit}>
        <div style={{
          display: 'flex', background: 'rgba(4,12,24,0.85)',
          border: '1px solid rgba(6,182,212,0.3)', borderRadius: 8,
          backdropFilter: 'blur(16px)', overflow: 'hidden',
          boxShadow: '0 0 20px rgba(6,182,212,0.1)',
        }}>
          <span style={{ padding: '0 12px', color: '#06b6d4', fontSize: 14, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {isLoading ? '⟳' : '🔍'}
          </span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="AI 自然語言查詢 — 例：A棟本週故障最多的設備？"
            style={{
              flex: 1, padding: '9px 0',
              background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.8)', fontSize: 11, outline: 'none',
            }}
          />
          {getStoredApiKey() && (
            <span style={{ padding: '0 8px', color: '#10b981', fontSize: 8, display: 'flex', alignItems: 'center' }}>AI</span>
          )}
          <button
            type="submit"
            style={{
              padding: '0 16px', background: 'rgba(6,182,212,0.15)',
              border: 'none', borderLeft: '1px solid rgba(6,182,212,0.2)',
              color: '#06b6d4', fontSize: 11, cursor: 'pointer',
            }}
          >查詢</button>
        </div>
      </form>

      {/* 快捷範例 */}
      {!expanded && (
        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
          {EXAMPLE_QUERIES.map(q => (
            <button key={q} onClick={() => handleQuery(q)} style={{
              padding: '2px 8px', background: 'rgba(15,23,42,0.7)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3,
              color: 'rgba(255,255,255,0.8)', fontSize: 9, cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}>{q}</button>
          ))}
        </div>
      )}
    </div>
  )
}


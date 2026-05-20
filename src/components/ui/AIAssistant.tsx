import { useState, useRef, useEffect, useCallback } from 'react'
import type { Device, Alert, KPIData } from '../../types'

interface Message {
  role: 'user' | 'assistant'
  content: string
  ts: string
}

interface Props {
  devices: Device[]
  alerts: Alert[]
  kpi: KPIData
}

import { getStoredApiKey, getStoredModel } from './ClaudeSettings'

// 組合系統背景上下文（傳入 Claude）
function buildSystemPrompt(devices: Device[], alerts: Alert[], kpi: KPIData): string {
  const criticals = alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'open')
  const warnings  = alerts.filter(a => a.severity === 'WARNING'  && a.status === 'open')
  return `你是一個 AI-First 企業智慧運維平台的 AI 助理，具備設備監控、能源管理、維運分析能力。
以下是目前系統即時狀態（請據此回答問題）：

【KPI 概況】
- 總設備: ${kpi.totalDevices} 台（正常 ${kpi.onlineDevices}、警示 ${kpi.warningDevices}、嚴重 ${kpi.criticalDevices}、離線 ${kpi.offlineDevices}）
- 即時需量: ${kpi.demandKw.toFixed(0)} kW / 契約 ${kpi.contractDemandKw} kW（${kpi.demandRatioPct.toFixed(1)}%）
- 今日用電: ${kpi.todayKwh.toLocaleString()} kWh
- 開啟告警: ${kpi.openAlerts} 筆
- MTTR: ${kpi.mttrHours} 小時 / MTBF: ${kpi.mtbfDays} 天 / 可用率: ${kpi.availabilityPct}%

【嚴重告警】
${criticals.length > 0 ? criticals.map(a => `- ${a.assetName}：${a.title}`).join('\n') : '目前無嚴重告警'}

【警示告警】
${warnings.length > 0 ? warnings.map(a => `- ${a.assetName}：${a.title}`).join('\n') : '目前無警示告警'}

【高風險設備 Top 5（AI 異常分數）】
${devices.sort((a, b) => (b.aiScore ?? 0) - (a.aiScore ?? 0)).slice(0, 5)
  .map(d => `- ${d.assetCode}（${d.name}）：分數 ${((d.aiScore ?? 0) * 100).toFixed(0)}/100，狀態 ${d.status}`).join('\n')}

請用繁體中文回答。回答要具體、簡潔。如果問題涉及預測、根因分析或行動建議，請給出專業判斷。`
}

// 呼叫 Claude API
async function callClaude(messages: Message[], systemPrompt: string): Promise<string> {
  const apiKey = getStoredApiKey()
  if (!apiKey) {
    return await mockResponse(messages[messages.length - 1]?.content ?? '')
  }

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
      max_tokens: 800,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Claude API ${resp.status}: ${err}`)
  }

  const data = await resp.json() as { content: Array<{ type: string; text: string }> }
  return data.content.find(c => c.type === 'text')?.text ?? '（無回應）'
}

// Mock 回應（未設定 API Key 時）
async function mockResponse(question: string): Promise<string> {
  await new Promise(r => setTimeout(r, 800))
  const q = question.toLowerCase()
  if (q.includes('需量') || q.includes('用電')) {
    return '根據即時監控資料，目前需量使用率約 87.5%，接近契約容量上限。建議啟動需量卸載計畫，優先卸載 A棟 6F 空調箱（-38.7 kW），預估可降低 3-5% 需量使用率，避免超約罰款。'
  }
  if (q.includes('告警') || q.includes('異常')) {
    return 'AI 偵測到目前有 2 筆嚴重告警：\n1. A棟3F空調箱 — 冷媒洩漏/膨脹閥故障（工單進行中）\n2. C棟精密空調 — 通訊中斷導致機房升溫至 42°C（緊急處理中）\n\n建議立即確認機房備援冷卻方案，防止 IT 設備過熱。'
  }
  if (q.includes('維護') || q.includes('保養') || q.includes('rul')) {
    return '根據 RUL 預測模型分析：\n- C棟1F精密空調 (RUL: 0天)：應立即更換或大修\n- A棟3F空調箱 (RUL: 45天)：建議下個月安排預防性維護\n- A棟2F UPS-01 (RUL: 180天)：Q3 前安排電池組檢測\n\n建議以 URGENT 優先級建立預防保養工單。'
  }
  return '感謝您的提問。目前系統運行正常，有 2 台設備需要緊急處理。如需進一步分析特定設備或能源數據，請提供更具體的問題，我將為您提供詳細的 AI 根因分析與行動建議。\n\n💡 提示：點擊右上角「⚙ AI設定」輸入 Anthropic API Key 即可啟用真實 Claude AI 回應。'
}

const QUICK_QUERIES = [
  '目前最高風險設備是哪些？',
  '需量快超約了，有什麼卸載建議？',
  '本月維護重點是什麼？',
  'C棟機房告警根因分析',
]

export function AIAssistant({ devices, alerts, kpi }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `您好！我是 AI 全平台運維助理。目前系統有 **${alerts.filter(a => a.status === 'open').length}** 筆開啟告警，需量使用率 **${kpi.demandRatioPct.toFixed(1)}%**。\n\n您可以詢問設備狀態、能源分析、維護建議或告警根因分析。`,
      ts: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const systemPrompt = useRef(buildSystemPrompt(devices, alerts, kpi))

  useEffect(() => {
    systemPrompt.current = buildSystemPrompt(devices, alerts, kpi)
  }, [devices, alerts, kpi])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: Message = {
      role: 'user', content: text.trim(),
      ts: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const history = [...messages, userMsg]
      const reply = await callClaude(history, systemPrompt.current)
      setMessages(prev => [...prev, {
        role: 'assistant', content: reply,
        ts: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠ 呼叫 AI 失敗：${String(e)}`,
        ts: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      }])
    } finally {
      setLoading(false)
    }
  }, [messages, loading])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* 對話標頭 */}
      <div style={{ padding: '6px 12px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div style={{ width: 2, height: 10, background: '#10b981', borderRadius: 1 }} />
          <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            AI 全平台助理
          </span>
          {(() => {
            const hasKey = !!getStoredApiKey()
            return (
              <span style={{
                marginLeft: 'auto', padding: '1px 5px',
                background: hasKey ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                border: `1px solid ${hasKey ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                borderRadius: 2, fontSize: 8,
                color: hasKey ? '#10b981' : '#f59e0b',
              }}>
                {hasKey ? 'Claude API' : 'Mock模式'}
              </span>
            )
          })()}
        </div>
      </div>

      {/* 訊息列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 4px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            marginBottom: 8,
            display: 'flex', flexDirection: 'column',
            alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '88%',
              padding: '7px 10px',
              background: m.role === 'user'
                ? 'rgba(6,182,212,0.14)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${m.role === 'user' ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: m.role === 'user' ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
              color: 'rgba(255,255,255,0.82)',
              fontSize: 10, lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
            }}>
              {m.role === 'assistant' && (
                <div style={{ color: '#10b981', fontSize: 8, fontWeight: 700, marginBottom: 4, letterSpacing: '0.05em' }}>
                  AI 助理
                </div>
              )}
              {m.content}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 8, marginTop: 2, paddingInline: 4 }}>
              {m.ts}
            </div>
          </div>
        ))}

        {/* 思考動畫 */}
        {loading && (
          <div style={{ display: 'flex', gap: 4, padding: '8px 10px', alignItems: 'center' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%', background: '#10b981',
                animation: 'bounce 1.2s infinite',
                animationDelay: `${i * 0.2}s`,
              }} />
            ))}
            <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}`}</style>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 快捷查詢 */}
      <div style={{ padding: '4px 8px 2px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {QUICK_QUERIES.map(q => (
            <button key={q}
              onClick={() => send(q)}
              disabled={loading}
              style={{
                padding: '2px 7px',
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.22)',
                borderRadius: 10,
                color: 'rgba(255,255,255,0.5)',
                fontSize: 8, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}>
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* 輸入框 */}
      <div style={{
        padding: '6px 8px 8px', flexShrink: 0,
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', gap: 6,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="輸入問題（Enter 送出）…"
          disabled={loading}
          rows={2}
          style={{
            flex: 1, resize: 'none',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 5, padding: '5px 8px',
            color: 'rgba(255,255,255,0.8)', fontSize: 10,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          style={{
            width: 36,
            background: input.trim() && !loading ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${input.trim() && !loading ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 5,
            color: input.trim() && !loading ? '#10b981' : 'rgba(255,255,255,0.2)',
            fontSize: 14, cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
          }}
        >↑</button>
      </div>
    </div>
  )
}

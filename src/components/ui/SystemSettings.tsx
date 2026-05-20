import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { SystemSettingsData, SceneSettings, AlertSettings, ConnectionSettings, AppearanceSettings, AISettingsData, EnergySettings, SkySettings, SkyPreset, WebhookSettings } from '../../hooks/useSystemSettings'
import { DEFAULT_SYSTEM_SETTINGS } from '../../hooks/useSystemSettings'
import { LS_API_KEY, LS_MODEL, DEFAULT_MODEL, getStoredApiKey } from './ClaudeSettings'

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5  (快速 · 低成本)' },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6 (均衡)' },
  { id: 'claude-opus-4-7',           label: 'Opus 4.7   (最強 · 最慢)' },
]

type TabId = 'scene' | 'alert' | 'connection' | 'ai' | 'appearance' | 'energy' | 'sky' | 'webhook'

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'scene',      icon: '🧊', label: '3D 場景' },
  { id: 'alert',      icon: '🔔', label: '告警通知' },
  { id: 'connection', icon: '🔌', label: '後端連線' },
  { id: 'ai',         icon: '🤖', label: 'AI 助理' },
  { id: 'appearance', icon: '🖥',  label: '外觀介面' },
  { id: 'energy',     icon: '⚡', label: '能源管理' },
  { id: 'sky',        icon: '🌌', label: 'BIM 天空' },
  { id: 'webhook',    icon: '🔗', label: 'Webhook' },
]

interface Props {
  settings: SystemSettingsData
  onUpdate: <K extends keyof SystemSettingsData>(section: K, patch: Partial<SystemSettingsData[K]>) => void
  onReset: () => void
  onClose: () => void
}

// ── Primitives ─────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: 38, height: 20, borderRadius: 10, flexShrink: 0,
        background: value ? '#06b6d4' : 'rgba(255,255,255,0.12)',
        border: `1px solid ${value ? '#06b6d4' : 'rgba(255,255,255,0.2)'}`,
        position: 'relative', cursor: 'pointer', transition: 'background 0.2s, border 0.2s',
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: value ? 20 : 2,
        width: 14, height: 14, borderRadius: '50%',
        background: '#fff', transition: 'left 0.18s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
      gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12 }}>{label}</div>
        {hint && <div style={{ color: 'rgba(255,255,255,0.32)', fontSize: 10, marginTop: 1 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: 'rgba(6,182,212,0.7)', fontSize: 9, fontWeight: 700,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      marginTop: 18, marginBottom: 2, paddingBottom: 4,
      borderBottom: '1px solid rgba(6,182,212,0.15)',
    }}>
      {children}
    </div>
  )
}

function RadioGroup<T extends string>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
            background: value === o.value ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${value === o.value ? 'rgba(6,182,212,0.5)' : 'rgba(255,255,255,0.12)'}`,
            color: value === o.value ? '#67e8f9' : 'rgba(255,255,255,0.5)',
            transition: 'all 0.15s',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Slider({
  value, min, max, step, onChange, format,
}: {
  value: number; min: number; max: number; step: number
  onChange: (v: number) => void; format?: (v: number) => string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: 100, accentColor: '#06b6d4' }}
      />
      <span style={{ color: '#06b6d4', fontSize: 11, minWidth: 36, textAlign: 'right' }}>
        {format ? format(value) : value}
      </span>
    </div>
  )
}

function NumberInput({ value, min, max, step = 1, onChange, unit }: {
  value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; unit?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: 72, padding: '3px 6px', fontSize: 11,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 4, color: '#e2e8f0', outline: 'none',
        }}
      />
      {unit && <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>{unit}</span>}
    </div>
  )
}

// ── Tab Pages ──────────────────────────────────────────────

function ScenePage({ s, update }: { s: SceneSettings; update: (p: Partial<SceneSettings>) => void }) {
  return (
    <>
      <GroupLabel>視覺特效</GroupLabel>
      <Row label="能流粒子特效" hint="建築間的能源流動粒子動畫">
        <Toggle value={s.showParticles} onChange={v => update({ showParticles: v })} />
      </Row>
      <Row label="脈衝環特效" hint="地面擴散的藍色脈衝環">
        <Toggle value={s.showPulseRings} onChange={v => update({ showPulseRings: v })} />
      </Row>
      <Row label="星空粒子" hint="場景中漂浮的空中粒子">
        <Toggle value={s.showStarField} onChange={v => update({ showStarField: v })} />
      </Row>

      <GroupLabel>設備標籤</GroupLabel>
      <Row label="標籤顯示規則" hint="控制 3D 場景中設備名稱標籤的顯示範圍">
        <RadioGroup
          value={s.labelDisplayRule}
          options={[
            { value: 'all',        label: '全部' },
            { value: 'alert_only', label: '僅異常' },
            { value: 'none',       label: '關閉' },
          ]}
          onChange={v => update({ labelDisplayRule: v })}
        />
      </Row>

      <GroupLabel>相機控制</GroupLabel>
      <Row label="慣性阻尼" hint="值越大，相機停止越緩慢（飛越感更強）">
        <Slider
          value={s.cameraDamping} min={0.01} max={0.2} step={0.01}
          onChange={v => update({ cameraDamping: v })}
          format={v => v.toFixed(2)}
        />
      </Row>
    </>
  )
}

function AlertPage({ s, update }: { s: AlertSettings; update: (p: Partial<AlertSettings>) => void }) {
  const toggleSeverity = (sev: 'CRITICAL' | 'ALARM' | 'WARNING' | 'INFO') => {
    const cur = s.severityFilter
    const next = cur.includes(sev) ? cur.filter(x => x !== sev) : [...cur, sev]
    if (next.length > 0) update({ severityFilter: next })
  }

  const requestDesktopNotify = async () => {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    update({ desktopNotify: perm === 'granted' })
  }

  const SEV_COLORS: Record<string, string> = {
    CRITICAL: '#ef4444', ALARM: '#f97316', WARNING: '#f59e0b', INFO: '#06b6d4',
  }

  return (
    <>
      <GroupLabel>通知方式</GroupLabel>
      <Row label="CRITICAL 告警音效" hint="新 CRITICAL 告警出現時播放提示音">
        <Toggle value={s.soundEnabled} onChange={v => update({ soundEnabled: v })} />
      </Row>
      <Row label="桌面推播通知" hint="需要瀏覽器授權才能啟用">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {s.desktopNotify
            ? <span style={{ color: '#10b981', fontSize: 10 }}>● 已授權</span>
            : (
              <button
                onClick={requestDesktopNotify}
                style={{
                  padding: '3px 10px', fontSize: 10, cursor: 'pointer',
                  background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)',
                  borderRadius: 4, color: '#67e8f9',
                }}
              >
                申請授權
              </button>
            )
          }
          <Toggle value={s.desktopNotify} onChange={v => update({ desktopNotify: v })} />
        </div>
      </Row>

      <GroupLabel>RUL 壽命預警</GroupLabel>
      <Row label="警告門檻天數" hint="低於此天數的設備將在面板中以紅色高亮">
        <RadioGroup
          value={String(s.rulThresholdDays) as never}
          options={[
            { value: '30',  label: '30天' },
            { value: '60',  label: '60天' },
            { value: '90',  label: '90天' },
            { value: '180', label: '180天' },
          ]}
          onChange={v => update({ rulThresholdDays: Number(v) })}
        />
      </Row>

      <GroupLabel>嚴重度過濾</GroupLabel>
      <Row label="預設顯示的告警等級" hint="取消勾選將在右側面板中隱藏該等級">
        <div style={{ display: 'flex', gap: 6 }}>
          {(['CRITICAL', 'ALARM', 'WARNING', 'INFO'] as const).map(sev => {
            const active = s.severityFilter.includes(sev)
            const col = SEV_COLORS[sev]
            return (
              <button
                key={sev}
                onClick={() => toggleSeverity(sev)}
                style={{
                  padding: '3px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
                  background: active ? `${col}22` : 'transparent',
                  border: `1px solid ${active ? col + '55' : 'rgba(255,255,255,0.1)'}`,
                  color: active ? col : 'rgba(255,255,255,0.3)',
                  transition: 'all 0.15s',
                }}
              >
                {sev === 'CRITICAL' ? '嚴重' : sev === 'ALARM' ? '告警' : sev === 'WARNING' ? '警示' : '資訊'}
              </button>
            )
          })}
        </div>
      </Row>
    </>
  )
}

function ConnectionPage({ s, update }: { s: ConnectionSettings; update: (p: Partial<ConnectionSettings>) => void }) {
  return (
    <>
      <div style={{
        padding: '8px 12px', marginBottom: 12,
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.25)',
        borderRadius: 6, color: 'rgba(245,158,11,0.8)', fontSize: 10, lineHeight: 1.6,
      }}>
        ⚠ 後端連線設定修改後需重新整理頁面（F5）才會生效。
      </div>

      <GroupLabel>WebSocket 端點</GroupLabel>
      <Row label="伺服器位址">
        <input
          value={s.wsUrl}
          onChange={e => update({ wsUrl: e.target.value })}
          style={{
            width: 200, padding: '4px 8px', fontSize: 11,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4, color: '#e2e8f0', outline: 'none',
          }}
        />
      </Row>

      <GroupLabel>連線模式</GroupLabel>
      <Row label="模式" hint="auto 會先嘗試連線後端，失敗再切 mock">
        <RadioGroup
          value={s.forceMode}
          options={[
            { value: 'auto', label: '自動' },
            { value: 'mock', label: '強制模擬' },
          ]}
          onChange={v => update({ forceMode: v })}
        />
      </Row>
      <Row label="重連間隔">
        <RadioGroup
          value={String(s.reconnectIntervalSec) as never}
          options={[
            { value: '3',  label: '3秒' },
            { value: '5',  label: '5秒' },
            { value: '10', label: '10秒' },
          ]}
          onChange={v => update({ reconnectIntervalSec: Number(v) })}
        />
      </Row>
    </>
  )
}

function AIPage({ s, update }: { s: AISettingsData; update: (p: Partial<AISettingsData>) => void }) {
  const [apiKey,     setApiKey]     = useState(localStorage.getItem(LS_API_KEY) ?? '')
  const [model,      setModel]      = useState(localStorage.getItem(LS_MODEL) ?? DEFAULT_MODEL)
  const [showKey,    setShowKey]    = useState(false)
  const [testState,  setTestState]  = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg,    setTestMsg]    = useState('')

  const saveApiKey = useCallback(() => {
    localStorage.setItem(LS_API_KEY, apiKey.trim())
    localStorage.setItem(LS_MODEL, model)
  }, [apiKey, model])

  const clearApiKey = useCallback(() => {
    localStorage.removeItem(LS_API_KEY)
    setApiKey('')
  }, [])

  const testApiKey = useCallback(async () => {
    const key = apiKey.trim()
    if (!key) { setTestMsg('請先輸入 API Key'); setTestState('fail'); return }
    setTestState('testing')
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-allow-browser': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })
      if (resp.ok) { setTestState('ok'); setTestMsg('連線成功') }
      else         { setTestState('fail'); setTestMsg(`HTTP ${resp.status}`) }
    } catch (e) {
      setTestState('fail'); setTestMsg(String(e))
    }
  }, [apiKey, model])

  const maskedKey = apiKey.trim().length > 14
    ? `${apiKey.slice(0, 10)}…${apiKey.slice(-4)}`
    : ''

  const storedKey = getStoredApiKey()

  return (
    <>
      <GroupLabel>Anthropic API</GroupLabel>
      {storedKey && (
        <div style={{
          padding: '5px 10px', marginBottom: 4,
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 5, color: '#6ee7b7', fontSize: 10,
        }}>
          ● 已配置 API Key {maskedKey && `(${maskedKey})`}
        </div>
      )}
      <Row label="API Key">
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-ant-…"
            style={{
              width: 160, padding: '3px 8px', fontSize: 11,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4, color: '#e2e8f0', outline: 'none',
            }}
          />
          <button
            onClick={() => setShowKey(v => !v)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14 }}
          >
            {showKey ? '🙈' : '👁'}
          </button>
        </div>
      </Row>
      <Row label="模型">
        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          style={{
            padding: '3px 8px', fontSize: 11,
            background: 'rgba(15,23,42,0.9)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4, color: '#e2e8f0', outline: 'none',
          }}
        >
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </Row>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          onClick={testApiKey}
          disabled={testState === 'testing'}
          style={{
            padding: '4px 12px', fontSize: 10, cursor: 'pointer',
            background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)',
            borderRadius: 4, color: '#67e8f9',
          }}
        >
          {testState === 'testing' ? '測試中…' : '測試連線'}
        </button>
        <button
          onClick={saveApiKey}
          style={{
            padding: '4px 12px', fontSize: 10, cursor: 'pointer',
            background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 4, color: '#6ee7b7',
          }}
        >
          儲存金鑰
        </button>
        <button
          onClick={clearApiKey}
          style={{
            padding: '4px 12px', fontSize: 10, cursor: 'pointer',
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, color: 'rgba(255,255,255,0.35)',
          }}
        >
          清除
        </button>
        {testMsg && (
          <span style={{ color: testState === 'ok' ? '#10b981' : '#f87171', fontSize: 10, alignSelf: 'center' }}>
            {testState === 'ok' ? '✓' : '✗'} {testMsg}
          </span>
        )}
      </div>

      <GroupLabel>回應設定</GroupLabel>
      <Row label="最大回應 Token" hint="數值越大，AI 回覆越詳細（也消耗更多 API 用量）">
        <Slider
          value={s.maxTokens} min={100} max={1000} step={50}
          onChange={v => update({ maxTokens: v })}
          format={v => `${v}`}
        />
      </Row>
      <Row label="系統 Prompt">
        <textarea
          value={s.systemPrompt}
          onChange={e => update({ systemPrompt: e.target.value })}
          rows={3}
          style={{
            width: 220, padding: '5px 8px', fontSize: 10, lineHeight: 1.6,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4, color: '#e2e8f0', outline: 'none',
            resize: 'vertical', fontFamily: 'monospace',
          }}
        />
      </Row>
    </>
  )
}

function AppearancePage({ s, update }: { s: AppearanceSettings; update: (p: Partial<AppearanceSettings>) => void }) {
  return (
    <>
      <GroupLabel>面板顯示</GroupLabel>
      <Row label="左側資產面板" hint="隱藏後中央 3D 場景空間更寬">
        <Toggle value={s.showLeftPanel} onChange={v => update({ showLeftPanel: v })} />
      </Row>
      <Row label="右側告警面板" hint="隱藏後可獲得更大的 3D 視野">
        <Toggle value={s.showRightPanel} onChange={v => update({ showRightPanel: v })} />
      </Row>

      <GroupLabel>告警跑馬燈</GroupLabel>
      <Row label="捲動速度">
        <RadioGroup
          value={s.tickerSpeed}
          options={[
            { value: 'slow',   label: '慢' },
            { value: 'medium', label: '中' },
            { value: 'fast',   label: '快' },
          ]}
          onChange={v => update({ tickerSpeed: v })}
        />
      </Row>
    </>
  )
}

function EnergyPage({ s, update }: { s: EnergySettings; update: (p: Partial<EnergySettings>) => void }) {
  return (
    <>
      <GroupLabel>契約與費率</GroupLabel>
      <Row label="契約容量" hint="用於計算需量使用比例">
        <NumberInput
          value={s.contractCapacityKw} min={100} max={10000} step={50}
          onChange={v => update({ contractCapacityKw: v })} unit="kW"
        />
      </Row>
      <Row label="電費單價" hint="用於計算今日用電成本">
        <NumberInput
          value={s.electricityCostPerKwh} min={0.5} max={20} step={0.1}
          onChange={v => update({ electricityCostPerKwh: v })} unit="NT$/kWh"
        />
      </Row>

      <GroupLabel>需量管理</GroupLabel>
      <Row label="需量警戒門檻" hint="超過此比例時，需量 KPI 以橘/紅色標示">
        <Slider
          value={s.demandWarningPct} min={50} max={95} step={5}
          onChange={v => update({ demandWarningPct: v })}
          format={v => `${v}%`}
        />
      </Row>

      <GroupLabel>尖峰時段</GroupLabel>
      <Row label="尖峰開始時間">
        <RadioGroup
          value={String(s.peakHourStart) as never}
          options={[
            { value: '7',  label: '07:00' },
            { value: '8',  label: '08:00' },
            { value: '9',  label: '09:00' },
          ]}
          onChange={v => update({ peakHourStart: Number(v) })}
        />
      </Row>
      <Row label="尖峰結束時間">
        <RadioGroup
          value={String(s.peakHourEnd) as never}
          options={[
            { value: '20', label: '20:00' },
            { value: '21', label: '21:00' },
            { value: '22', label: '22:00' },
          ]}
          onChange={v => update({ peakHourEnd: Number(v) })}
        />
      </Row>

      <div style={{
        marginTop: 16, padding: '8px 12px',
        background: 'rgba(6,182,212,0.06)',
        border: '1px solid rgba(6,182,212,0.15)',
        borderRadius: 6, color: 'rgba(255,255,255,0.45)', fontSize: 10, lineHeight: 1.7,
      }}>
        💡 今日預估電費 = 今日用電度數 × 電費單價<br />
        需量 % = 即時需量 ÷ 契約容量 × 100
      </div>
    </>
  )
}

// ── Sky Page ───────────────────────────────────────────────

const SKY_PRESET_META: { id: SkyPreset; label: string; icon: string; colors: { top: string; horizon: string } }[] = [
  { id: 'day',      label: '白天', icon: '☀',  colors: { top: '#1a6b9a', horizon: '#8ec4dc' } },
  { id: 'dusk',     label: '黃昏', icon: '🌇', colors: { top: '#1a1a4a', horizon: '#e05030' } },
  { id: 'dawn',     label: '黎明', icon: '🌄', colors: { top: '#1a2a5e', horizon: '#e07040' } },
  { id: 'night',    label: '夜晚', icon: '🌙', colors: { top: '#020409', horizon: '#0a1428' } },
  { id: 'overcast', label: '陰天', icon: '☁',  colors: { top: '#445566', horizon: '#8899aa' } },
  { id: 'space',    label: '太空', icon: '🚀', colors: { top: '#000205', horizon: '#020a18' } },
]

const SKY_PRESET_DEFAULTS: Record<SkyPreset, Partial<SkySettings>> = {
  day:      { topColor: '#1a6b9a', horizonColor: '#8ec4dc', groundColor: '#1a2840', showStars: false, showSun: true,  showClouds: true,  skyExponent: 0.8  },
  dusk:     { topColor: '#1a1a4a', horizonColor: '#e05030', groundColor: '#0d1117', showStars: true,  showSun: true,  showClouds: true,  skyExponent: 0.6  },
  dawn:     { topColor: '#1a2a5e', horizonColor: '#e07040', groundColor: '#0d1117', showStars: false, showSun: true,  showClouds: true,  skyExponent: 0.7  },
  night:    { topColor: '#020409', horizonColor: '#0a1428', groundColor: '#060a12', showStars: true,  showSun: false, showClouds: false, skyExponent: 1.2  },
  overcast: { topColor: '#445566', horizonColor: '#8899aa', groundColor: '#1a2030', showStars: false, showSun: false, showClouds: true,  skyExponent: 0.5  },
  space:    { topColor: '#000205', horizonColor: '#020a18', groundColor: '#000002', showStars: true,  showSun: false, showClouds: false, skyExponent: 1.5, starCount: 5000, starBrightness: 1.0 },
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="color" value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: 28, height: 22, cursor: 'pointer', border: 'none', padding: 0, borderRadius: 3, background: 'none' }}
      />
      <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontFamily: 'monospace' }}>{value}</span>
      <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>{label}</span>
    </div>
  )
}

function SkyPage({ s, update }: { s: SkySettings; update: (p: Partial<SkySettings>) => void }) {
  const applyPreset = (preset: SkyPreset) => {
    update({ preset, ...SKY_PRESET_DEFAULTS[preset] })
  }

  return (
    <>
      <GroupLabel>快速預設</GroupLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
        {SKY_PRESET_META.map(p => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            style={{
              padding: '5px 12px', fontSize: 11, cursor: 'pointer', borderRadius: 5,
              background: s.preset === p.id
                ? `linear-gradient(135deg, ${p.colors.top}, ${p.colors.horizon})`
                : 'rgba(255,255,255,0.05)',
              border: `1px solid ${s.preset === p.id ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)'}`,
              color: s.preset === p.id ? '#fff' : 'rgba(255,255,255,0.5)',
              display: 'flex', alignItems: 'center', gap: 5,
              fontWeight: s.preset === p.id ? 700 : 400,
              transition: 'all 0.15s',
              textShadow: s.preset === p.id ? '0 1px 3px rgba(0,0,0,0.6)' : 'none',
            }}
          >
            <span>{p.icon}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      <GroupLabel>天空元素</GroupLabel>
      <Row label="顯示星星" hint="夜晚與太空預設效果最佳">
        <Toggle value={s.showStars} onChange={v => update({ showStars: v })} />
      </Row>
      <Row label="顯示雲朵" hint="白天與陰天時更自然">
        <Toggle value={s.showClouds} onChange={v => update({ showClouds: v })} />
      </Row>
      <Row label="顯示太陽" hint="白天與黃昏時使用">
        <Toggle value={s.showSun} onChange={v => update({ showSun: v })} />
      </Row>
      <Row label="大氣霧效" hint="啟用後距離越遠越模糊">
        <Toggle value={s.showFog} onChange={v => update({ showFog: v })} />
      </Row>

      <GroupLabel>天空漸層色彩</GroupLabel>
      <Row label="頂部顏色">
        <ColorPicker label="天頂" value={s.topColor} onChange={v => update({ topColor: v, preset: 'day' })} />
      </Row>
      <Row label="地平線顏色">
        <ColorPicker label="水平線" value={s.horizonColor} onChange={v => update({ horizonColor: v, preset: 'day' })} />
      </Row>
      <Row label="地面顏色">
        <ColorPicker label="地面" value={s.groundColor} onChange={v => update({ groundColor: v, preset: 'day' })} />
      </Row>
      <Row label="漸層指數" hint="值越小，地平線色帶越寬">
        <Slider value={s.skyExponent} min={0.2} max={2.0} step={0.1}
          onChange={v => update({ skyExponent: v })} format={v => v.toFixed(1)} />
      </Row>

      <GroupLabel>太陽 / 星星 / 雲朵</GroupLabel>
      <Row label="太陽仰角" hint="5° = 日落，85° = 正午">
        <Slider value={s.sunElevation} min={5} max={85} step={1}
          onChange={v => update({ sunElevation: v })} format={v => `${v}°`} />
      </Row>
      <Row label="星星數量">
        <Slider value={s.starCount} min={500} max={5000} step={100}
          onChange={v => update({ starCount: v })} format={v => `${v}`} />
      </Row>
      <Row label="星星亮度">
        <Slider value={s.starBrightness} min={0.2} max={1.0} step={0.05}
          onChange={v => update({ starBrightness: v })} format={v => v.toFixed(2)} />
      </Row>
      <Row label="雲朵數量">
        <Slider value={s.cloudCount} min={2} max={20} step={1}
          onChange={v => update({ cloudCount: v })} format={v => `${v}`} />
      </Row>
      <Row label="雲朵飄移速度">
        <Slider value={s.cloudSpeed} min={0.1} max={3.0} step={0.1}
          onChange={v => update({ cloudSpeed: v })} format={v => v.toFixed(1)} />
      </Row>

      {s.showFog && (
        <>
          <GroupLabel>霧效範圍</GroupLabel>
          <Row label="霧起始距離">
            <NumberInput value={s.fogNear} min={50} max={500} step={10}
              onChange={v => update({ fogNear: v })} unit="m" />
          </Row>
          <Row label="霧全覆蓋距離">
            <NumberInput value={s.fogFar} min={300} max={2000} step={50}
              onChange={v => update({ fogFar: v })} unit="m" />
          </Row>
        </>
      )}

      <div style={{
        marginTop: 14, padding: '8px 12px',
        background: 'rgba(6,182,212,0.06)',
        border: '1px solid rgba(6,182,212,0.15)',
        borderRadius: 6, color: 'rgba(255,255,255,0.38)', fontSize: 10, lineHeight: 1.7,
      }}>
        💡 天空設定即時套用至 BIM 檢視器，不需重新載入模型。<br />
        雲朵數量或星星數量變更後，需重新開啟 BIM 視圖或切換模型才完整生效。
      </div>
    </>
  )
}

// ── Webhook Page ───────────────────────────────────────────

function WebhookPage({ s, update }: { s: WebhookSettings; update: (p: Partial<WebhookSettings>) => void }) {
  const [testState, setTestState] = useState<'idle' | 'sending' | 'ok' | 'fail'>('idle')
  const [testMsg,   setTestMsg]   = useState('')

  const testWebhook = async () => {
    if (!s.url) { setTestMsg('請先填入 Webhook URL'); setTestState('fail'); return }
    setTestState('sending')
    try {
      await fetch(s.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, source: '3D監控管理平台', timestamp: new Date().toISOString() }),
        mode: 'no-cors',
      })
      setTestState('ok'); setTestMsg('已送出測試訊息（no-cors）')
    } catch (e) {
      setTestState('fail'); setTestMsg(String(e))
    }
  }

  const SEV_ORDER: WebhookSettings['minSeverity'][] = ['CRITICAL', 'ALARM', 'WARNING']
  const SEV_LABELS: Record<string, string> = { CRITICAL: '嚴重', ALARM: '告警', WARNING: '警示' }

  return (
    <>
      <div style={{
        padding: '8px 12px', marginBottom: 12,
        background: 'rgba(6,182,212,0.06)',
        border: '1px solid rgba(6,182,212,0.2)',
        borderRadius: 6, color: 'rgba(255,255,255,0.45)', fontSize: 10, lineHeight: 1.7,
      }}>
        💡 當告警觸發時，平台可主動推送 POST 請求至您的外部 Webhook（如 Slack、Teams、n8n 等）。
      </div>

      <GroupLabel>基本設定</GroupLabel>
      <Row label="啟用 Webhook" hint="關閉後不送出任何推送">
        <Toggle value={s.enabled} onChange={v => update({ enabled: v })} />
      </Row>
      <Row label="目標 URL">
        <input
          value={s.url}
          onChange={e => update({ url: e.target.value })}
          placeholder="https://hooks.slack.com/services/…"
          style={{
            width: 210, padding: '4px 8px', fontSize: 10,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4, color: '#e2e8f0', outline: 'none',
          }}
        />
      </Row>

      <GroupLabel>觸發條件</GroupLabel>
      <Row label="最低嚴重度" hint="達到此等級或以上才推送">
        <RadioGroup
          value={s.minSeverity}
          options={SEV_ORDER.map(v => ({ value: v, label: SEV_LABELS[v] }))}
          onChange={v => update({ minSeverity: v })}
        />
      </Row>
      <Row label="冷卻時間" hint="同一告警兩次推送的最短間隔">
        <RadioGroup
          value={String(s.cooldownMinutes) as never}
          options={[
            { value: '1',  label: '1 分鐘' },
            { value: '5',  label: '5 分鐘' },
            { value: '15', label: '15 分鐘' },
            { value: '60', label: '1 小時' },
          ]}
          onChange={v => update({ cooldownMinutes: Number(v) })}
        />
      </Row>

      <GroupLabel>測試</GroupLabel>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 4 }}>
        <button
          onClick={testWebhook}
          disabled={testState === 'sending'}
          style={{
            padding: '5px 14px', fontSize: 10, cursor: 'pointer',
            background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)',
            borderRadius: 4, color: '#67e8f9',
          }}
        >
          {testState === 'sending' ? '傳送中…' : '傳送測試訊息'}
        </button>
        {testMsg && (
          <span style={{ color: testState === 'ok' ? '#10b981' : '#f87171', fontSize: 10 }}>
            {testState === 'ok' ? '✓' : '✗'} {testMsg}
          </span>
        )}
      </div>
    </>
  )
}

// ── Main Component ─────────────────────────────────────────

export function SystemSettings({ settings, onUpdate, onReset, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('scene')
  const [resetConfirm, setResetConfirm] = useState(false)

  const handleReset = () => {
    if (!resetConfirm) { setResetConfirm(true); return }
    onReset()
    setResetConfirm(false)
  }

  const updateSection = <K extends keyof SystemSettingsData>(section: K) =>
    (patch: Partial<SystemSettingsData[K]>) => onUpdate(section, patch)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(1,4,12,0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0,  scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.22 }}
        style={{
          width: 760, height: 560,
          background: 'rgba(6,14,30,0.97)',
          border: '1px solid rgba(6,182,212,0.2)',
          borderRadius: 10,
          boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(6,182,212,0.08)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(6,182,212,0.04)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>⚙</span>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: 600, letterSpacing: '0.04em' }}>
              系統設定
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
              fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{
            width: 160, flexShrink: 0,
            borderRight: '1px solid rgba(255,255,255,0.06)',
            padding: '10px 0',
            display: 'flex', flexDirection: 'column', gap: 1,
          }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '9px 16px',
                  background: activeTab === tab.id
                    ? 'rgba(6,182,212,0.12)'
                    : 'transparent',
                  borderLeft: `2px solid ${activeTab === tab.id ? '#06b6d4' : 'transparent'}`,
                  border: 'none',
                  borderLeftWidth: 2,
                  borderLeftStyle: 'solid',
                  borderLeftColor: activeTab === tab.id ? '#06b6d4' : 'transparent',
                  color: activeTab === tab.id ? '#67e8f9' : 'rgba(255,255,255,0.45)',
                  fontSize: 12, cursor: 'pointer', textAlign: 'left', width: '100%',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 14 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{
            flex: 1, padding: '16px 22px', overflowY: 'auto',
          }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === 'scene'      && <ScenePage      s={settings.scene}      update={updateSection('scene')}      />}
                {activeTab === 'alert'      && <AlertPage      s={settings.alert}      update={updateSection('alert')}      />}
                {activeTab === 'connection' && <ConnectionPage s={settings.connection} update={updateSection('connection')} />}
                {activeTab === 'ai'         && <AIPage         s={settings.ai}         update={updateSection('ai')}         />}
                {activeTab === 'appearance' && <AppearancePage s={settings.appearance} update={updateSection('appearance')} />}
                {activeTab === 'energy'     && <EnergyPage     s={settings.energy}     update={updateSection('energy')}     />}
                {activeTab === 'sky'        && <SkyPage        s={settings.sky}        update={updateSection('sky')}        />}
                {activeTab === 'webhook'    && <WebhookPage    s={settings.webhook}    update={updateSection('webhook')}    />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 20px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(0,0,0,0.2)',
          flexShrink: 0,
        }}>
          <button
            onClick={handleReset}
            onBlur={() => setResetConfirm(false)}
            style={{
              padding: '5px 14px', fontSize: 10, cursor: 'pointer',
              background: resetConfirm ? 'rgba(239,68,68,0.12)' : 'transparent',
              border: `1px solid ${resetConfirm ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 4,
              color: resetConfirm ? '#f87171' : 'rgba(255,255,255,0.3)',
              transition: 'all 0.15s',
            }}
          >
            {resetConfirm ? '確認重置所有設定？' : '↺ 恢復預設值'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9 }}>設定即時生效 · 自動儲存</span>
            <button
              onClick={onClose}
              style={{
                padding: '5px 20px', fontSize: 11, cursor: 'pointer',
                background: 'rgba(6,182,212,0.15)',
                border: '1px solid rgba(6,182,212,0.4)',
                borderRadius: 4, color: '#67e8f9',
              }}
            >
              完成
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

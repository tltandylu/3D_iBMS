/**
 * 共用 Claude Messages API 呼叫（瀏覽器直連 api.anthropic.com）
 */
const CLAUDE_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClaudeRequest {
  model: string
  max_tokens: number
  system?: string
  messages: ClaudeMessage[]
}

export interface ClaudeResponse {
  content?: Array<{ type?: string; text?: string }>
}

/** POST /v1/messages；回傳原始 Response，錯誤處理由呼叫端決定 */
export function postClaudeMessages(apiKey: string, body: ClaudeRequest): Promise<Response> {
  return fetch(CLAUDE_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
    },
    body: JSON.stringify(body),
  })
}

/** 取出回應中第一個 text block */
export function extractClaudeText(data: ClaudeResponse): string | undefined {
  return data.content?.find(c => c.type === 'text')?.text
}

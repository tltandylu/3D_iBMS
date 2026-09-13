import { authHeaders } from '../api/http'

/**
 * Client-side CSV export utility.
 * Generates a UTF-8 BOM CSV and triggers a browser download.
 */
export function downloadCSV(
  filename: string,
  headers:  string[],
  rows:     (string | number | undefined | null)[][],
): void {
  const escape = (v: string | number | undefined | null): string => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [
    headers.map(escape).join(','),
    ...rows.map(r => r.map(escape).join(',')),
  ]
  const bom  = '﻿'   // UTF-8 BOM — Excel 可直接開啟中文
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Trigger a backend-streaming CSV download (authenticated). */
export async function downloadFromBackend(
  url:      string,
  filename: string,
): Promise<void> {
  const res = await fetch(url, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`)
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = href
  a.download = filename
  a.click()
  URL.revokeObjectURL(href)
}

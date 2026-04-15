/**
 * Telegram Bot notification helper
 * Uses raw fetch — no SDK needed.
 * Silently no-ops if env vars are missing.
 */

const TELEGRAM_API = 'https://api.telegram.org'

export async function sendTelegram(
  text: string,
  options?: { parseMode?: 'HTML' | 'Markdown' }
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) return false

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode || 'HTML',
        disable_web_page_preview: true,
      }),
    })

    if (!res.ok) {
      console.error(`Telegram error: ${res.status} ${await res.text().catch(() => '')}`)
      return false
    }
    return true
  } catch (err) {
    console.error('Telegram send failed:', err instanceof Error ? err.message : err)
    return false
  }
}

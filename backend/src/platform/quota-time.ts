const pacific = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
function parts(date: Date) { return Object.fromEntries(pacific.formatToParts(date).map(p => [p.type, p.value])) }
export function quotaDay(date: Date) { const p = parts(date); return `${p.year}-${p.month}-${p.day}` }
export function nextQuotaReset(date: Date) {
  const p = parts(date)
  const next = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1))
  const target = next.toISOString().slice(0, 10)
  // Pacific midnight is UTC 07:00 or 08:00; validate the date across DST transitions.
  for (const hour of [7, 8]) {
    const candidate = new Date(next.getTime() + hour * 3600000)
    if (quotaDay(candidate) === target && parts(candidate).hour === '00') return candidate.toISOString()
  }
  throw new Error('Cannot determine Pacific quota reset')
}
export function youtubeProjectNumber(appId: string) {
  return /^(\d+)-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.exec(appId || '')?.[1] || null
}
export function quotaStart(date: Date) {
  const day = quotaDay(date)
  for (const hour of [7, 8]) {
    const candidate = new Date(day + 'T' + strHour(hour) + ':00:00Z')
    if (quotaDay(candidate) === day && parts(candidate).hour === '00') return candidate
  }
  throw new Error('Cannot determine Pacific quota start')
}
function strHour(hour: number) { return String(hour).padStart(2, '0') }

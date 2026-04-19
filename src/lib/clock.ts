export type ClockCity = { label: string; tz: string }

export const CITIES: ClockCity[] = [
  { label: 'sf',  tz: 'America/Los_Angeles' },
  { label: 'nyc', tz: 'America/New_York' },
  { label: 'ldn', tz: 'Europe/London' },
  { label: 'del', tz: 'Asia/Kolkata' },
  { label: 'tyo', tz: 'Asia/Tokyo' },
  { label: 'syd', tz: 'Australia/Sydney' },
]

export function formatTime(tz: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatUTC(date: Date = new Date()): string {
  return formatTime('UTC', date)
}

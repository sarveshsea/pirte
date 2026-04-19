export type ClockCity = { label: string; tz: string }

export const CITIES: ClockCity[] = [
  { label: 'SF',  tz: 'America/Los_Angeles' },
  { label: 'NYC', tz: 'America/New_York' },
  { label: 'LDN', tz: 'Europe/London' },
  { label: 'DEL', tz: 'Asia/Kolkata' },
  { label: 'TYO', tz: 'Asia/Tokyo' },
  { label: 'SYD', tz: 'Australia/Sydney' },
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

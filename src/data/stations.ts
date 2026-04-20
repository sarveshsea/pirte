/* curated radio stations with direct, https, browser-playable streams.
   the fermont entry uses radio.garden's unofficial stream endpoint — kept
   because it's the seed that inspired this page. if that endpoint breaks,
   the other stations keep working since each url stands alone. */

export type Station = {
  id: string
  city: string       // lowercase
  country: string    // lowercase
  cc: string         // 2-letter iso lowercase
  lat: number
  lon: number
  name: string       // station name lowercase
  genre: string      // one short lowercase tag
  url: string
}

export const STATIONS: Station[] = [
  // us — somafm (san francisco)
  { id: 'soma-groove',   city: 'san francisco', country: 'united states', cc: 'us', lat: 37.77, lon: -122.42, name: 'somafm · groove salad',    genre: 'downtempo', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { id: 'soma-drone',    city: 'san francisco', country: 'united states', cc: 'us', lat: 37.77, lon: -122.42, name: 'somafm · drone zone',      genre: 'ambient',   url: 'https://ice1.somafm.com/dronezone-128-mp3' },
  { id: 'soma-secret',   city: 'san francisco', country: 'united states', cc: 'us', lat: 37.77, lon: -122.42, name: 'somafm · secret agent',    genre: 'lounge',    url: 'https://ice1.somafm.com/secretagent-128-mp3' },
  { id: 'soma-indie',    city: 'san francisco', country: 'united states', cc: 'us', lat: 37.77, lon: -122.42, name: 'somafm · indie pop rocks', genre: 'indie',     url: 'https://ice1.somafm.com/indiepop-128-mp3' },
  { id: 'soma-defcon',   city: 'san francisco', country: 'united states', cc: 'us', lat: 37.77, lon: -122.42, name: 'somafm · defcon radio',    genre: 'electronic', url: 'https://ice1.somafm.com/defcon-128-mp3' },
  // us — radio paradise (paradise, ca)
  { id: 'rp-main',       city: 'paradise',      country: 'united states', cc: 'us', lat: 39.76, lon: -121.62, name: 'radio paradise · main',    genre: 'eclectic',  url: 'https://stream.radioparadise.com/mp3-128' },
  { id: 'rp-mellow',     city: 'paradise',      country: 'united states', cc: 'us', lat: 39.76, lon: -121.62, name: 'radio paradise · mellow',  genre: 'chill',     url: 'https://stream.radioparadise.com/mellow-128' },
  // us — public radio
  { id: 'kexp',          city: 'seattle',       country: 'united states', cc: 'us', lat: 47.61, lon: -122.33, name: 'kexp 90.3',                genre: 'indie',     url: 'https://kexp-mp3-128.streamguys1.com/kexp128.mp3' },
  { id: 'wwoz',          city: 'new orleans',   country: 'united states', cc: 'us', lat: 29.95, lon: -90.07,  name: 'wwoz 90.7',                genre: 'jazz',      url: 'https://wwoz-sc.streamguys1.com/wwoz-hi.mp3' },
  // france — radio france
  { id: 'fip',           city: 'paris',         country: 'france',        cc: 'fr', lat: 48.86, lon: 2.35,    name: 'fip',                      genre: 'eclectic',  url: 'https://icecast.radiofrance.fr/fip-midfi.mp3' },
  { id: 'france-musique', city: 'paris',        country: 'france',        cc: 'fr', lat: 48.86, lon: 2.35,    name: 'france musique',           genre: 'classical', url: 'https://icecast.radiofrance.fr/francemusique-midfi.mp3' },
  { id: 'france-inter',  city: 'paris',         country: 'france',        cc: 'fr', lat: 48.86, lon: 2.35,    name: 'france inter',             genre: 'talk',      url: 'https://icecast.radiofrance.fr/franceinter-midfi.mp3' },
  // ireland — rté
  { id: 'rte-r1',        city: 'dublin',        country: 'ireland',       cc: 'ie', lat: 53.35, lon: -6.26,   name: 'rté radio 1',              genre: 'talk',      url: 'https://icecast.rte.ie/icecast/radio1.mp3' },
  { id: 'rte-2fm',       city: 'dublin',        country: 'ireland',       cc: 'ie', lat: 53.35, lon: -6.26,   name: 'rté 2fm',                  genre: 'pop',       url: 'https://icecast.rte.ie/icecast/2fm.mp3' },
  // germany
  { id: 'dlf',           city: 'cologne',       country: 'germany',       cc: 'de', lat: 50.94, lon: 6.96,    name: 'deutschlandfunk',          genre: 'talk',      url: 'https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3' },
  // canada — from the link that inspired this page
  { id: 'fermont',       city: 'fermont',       country: 'canada',        cc: 'ca', lat: 52.78, lon: -67.09,  name: 'cfmf 103.1',               genre: 'local',     url: 'https://radio.garden/api/ara/content/listen/GgID8aJ9/channel.mp3' },
]

/* accepts a radio.garden "visit" or "listen" url and returns a direct stream url,
   or returns the input unchanged if it already looks like a stream url. */
export function resolveStreamUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  // already a stream endpoint
  if (/\/channel\.mp3/.test(trimmed)) return trimmed
  // radio.garden page url: .../visit/<slug>/<channelId>  or  .../listen/<slug>/<channelId>
  const match = trimmed.match(/radio\.garden\/(?:visit|listen)\/[^/]+\/([A-Za-z0-9]+)/)
  if (match) return `https://radio.garden/api/ara/content/listen/${match[1]}/channel.mp3`
  // bare channel id (8-10 alphanumeric)
  if (/^[A-Za-z0-9]{6,14}$/.test(trimmed)) return `https://radio.garden/api/ara/content/listen/${trimmed}/channel.mp3`
  // direct url (trust it)
  if (/^https?:\/\//.test(trimmed)) return trimmed
  return ''
}

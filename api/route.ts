/**
 * Vercel serverless function: GET /api/route
 *
 * Server-side proxy for OSRM routing.  Originally the CommuteCalculator
 * widget called router.project-osrm.org directly from the browser, but
 * Brave Shields and uBlock Origin block the third-party fetch — users
 * saw "—" for driving/walking/cycling on the listing detail page.
 *
 * Proxying through our own origin avoids the block AND lets us fall back
 * to a Haversine straight-line estimate when OSRM is slow or down (the
 * public demo is unreliable).
 *
 * Query: ?from=lat,lng&to=lat,lng&mode=driving|walking|cycling
 * Response: { durationSeconds: number, distanceMeters: number, estimated: boolean }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

type Mode = 'driving' | 'walking' | 'cycling'
const OSRM_TIMEOUT_MS = 4_000

// Average travel speeds (m/s) used for the Haversine fallback.  Israeli
// urban driving averages ~30-50 km/h, intercity ~80; use 55 km/h as a
// compromise.  Walking 5 km/h, cycling 18 km/h are textbook averages.
const FALLBACK_SPEED_MS: Record<Mode, number> = {
  driving: 55 / 3.6,
  walking:  5 / 3.6,
  cycling: 18 / 3.6,
}

function parseLatLng(s: string | undefined): [number, number] | null {
  if (!s) return null
  const [lat, lng] = s.split(',').map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return [lat, lng]
}

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

async function osrm(from: [number, number], to: [number, number], mode: Mode): Promise<{ durationSeconds: number; distanceMeters: number } | null> {
  const profile = mode === 'driving' ? 'driving' : mode === 'walking' ? 'foot' : 'bike'
  // OSRM uses lon,lat order (not lat,lng)
  const url = `https://router.project-osrm.org/route/v1/${profile}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=false`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), OSRM_TIMEOUT_MS)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) return null
    const data = await r.json() as { routes?: Array<{ duration: number; distance: number }> }
    const first = data.routes?.[0]
    if (!first) return null
    return { durationSeconds: first.duration, distanceMeters: first.distance }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const from = parseLatLng(typeof req.query.from === 'string' ? req.query.from : undefined)
  const to   = parseLatLng(typeof req.query.to   === 'string' ? req.query.to   : undefined)
  const mode = (req.query.mode === 'walking' || req.query.mode === 'cycling') ? req.query.mode : 'driving'

  if (!from || !to) return res.status(400).json({ error: 'invalid_coords' })

  // OSRM public demo (router.project-osrm.org) only really supports
  // the 'driving' profile - requests for 'foot' / 'bike' silently fall
  // back to driving timings (a 94km walk returns the 77-min DRIVE time,
  // not the realistic ~19h walk).  So we only consult OSRM for driving;
  // walking/cycling go straight to Haversine where the speed assumption
  // is at least directionally correct.
  if (mode === 'driving') {
    const real = await osrm(from, to, 'driving')
    if (real) {
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600')
      return res.status(200).json({ ...real, estimated: false })
    }
  }

  // Haversine fallback - straight-line distance ÷ assumed average speed.
  // Returned with estimated:true so the widget can show a subtle "~" hint.
  const dist = haversineMeters(from, to)
  // For driving/cycling assume 1.3× detour vs straight line (winding roads).
  // Walking uses 1.1× (pedestrian network often more direct).
  const detour = mode === 'walking' ? 1.1 : 1.3
  const adjusted = dist * detour
  const duration = adjusted / FALLBACK_SPEED_MS[mode]
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600')
  return res.status(200).json({
    durationSeconds: Math.round(duration),
    distanceMeters:  Math.round(adjusted),
    estimated:       true,
  })
}

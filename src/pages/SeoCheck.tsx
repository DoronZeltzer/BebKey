import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSeo } from '../hooks/useSeo'
import { ADMIN_EMAILS } from '../lib/adminEmails'

/**
 * Admin-only SEO dashboard (/admin/seo).
 *
 * Surfaces, at a glance, "what's going on and what needs to be done" for SEO:
 *  - live coverage (listings, cities, content quality)
 *  - sitemap health (per-file URL counts + last build date)
 *  - an automated checklist of on-site SEO fundamentals
 *  - a prioritized action list
 *
 * Internal tool → English copy (not part of the user-facing i18n).
 */

const SITE = 'https://www.bebkey.com'
const SUBMAPS = [
  'sitemap-static.xml', 'sitemap-listings.xml', 'sitemap-landings.xml',
  'sitemap-cities.xml', 'sitemap-blog.xml', 'sitemap-guides.xml',
]
const GSC = 'https://search.google.com/search-console?resource_id=' + encodeURIComponent(SITE + '/')

type Stat = number | null
interface Coverage {
  active: Stat; withImage: Stat; geocoded: Stat; withDesc: Stat; cities: Stat
}
interface SiteMap { name: string; urls: number | null; lastmod: string | null }
type Level = 'ok' | 'warn' | 'todo'
interface Check { label: string; level: Level; detail: string }

interface AdSpend {
  id: string; platform: string; campaign: string | null
  amount: number; currency: string; spend_date: string; notes: string | null
}
interface AcqRow { source: string | null; created_at: string }

const AD_PLATFORMS = ['google', 'facebook', 'instagram', 'tiktok', 'other']
const SOURCE_ICON: Record<string, string> = {
  google: '🔍', facebook: '📘', instagram: '📸', tiktok: '🎵',
  twitter: '🐦', bing: '🔎', direct: '🔗', email: '✉️',
}
function ils(n: number): string {
  return '₪' + Math.round(n).toLocaleString()
}

function pct(n: Stat, d: Stat): string {
  if (!n || !d) return '—'
  return Math.round((n / d) * 100) + '%'
}
function fmt(n: Stat): string {
  return n == null ? '—' : n.toLocaleString()
}

export default function SeoCheck() {
  useSeo({ title: 'SEO Check | BebKey Admin' })
  const { user, loading: authLoading } = useAuth()
  const isAdmin = !authLoading && !!user?.email && ADMIN_EMAILS.has(user.email)

  const [loading, setLoading] = useState(true)
  const [cov, setCov] = useState<Coverage>({ active: null, withImage: null, geocoded: null, withDesc: null, cities: null })
  const [maps, setMaps] = useState<SiteMap[]>([])
  const [robotsOk, setRobotsOk] = useState<boolean | null>(null)
  const [ranAt, setRanAt] = useState<string>('')

  // ── Marketing & attribution ───────────────────────────────────────────────
  const [adSpend, setAdSpend] = useState<AdSpend[]>([])
  const [acq, setAcq] = useState<AcqRow[]>([])
  const [mktReady, setMktReady] = useState<boolean | null>(null) // false = tables not created yet
  const [nsPlatform, setNsPlatform] = useState('google')
  const [nsCampaign, setNsCampaign] = useState('')
  const [nsAmount, setNsAmount] = useState('')
  const [nsDate, setNsDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [nsNotes, setNsNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const loadMarketing = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ad_spend').select('*').order('spend_date', { ascending: false }).limit(500)
      if (error) { setMktReady(false); return }           // table missing → show setup note
      setAdSpend((data || []) as AdSpend[])
      const { data: a } = await supabase
        .from('acquisitions').select('source, created_at').limit(5000)
      setAcq((a || []) as AcqRow[])
      setMktReady(true)
    } catch { setMktReady(false) }
  }, [])

  const addSpend = async () => {
    const amt = parseFloat(nsAmount)
    if (!nsPlatform || !(amt >= 0)) return
    setSaving(true)
    const { error } = await supabase.from('ad_spend').insert({
      platform: nsPlatform, campaign: nsCampaign.trim() || null, amount: amt,
      currency: 'ILS', spend_date: nsDate, notes: nsNotes.trim() || null,
    })
    setSaving(false)
    if (error) { alert('Could not save: ' + error.message); return }
    setNsCampaign(''); setNsAmount(''); setNsNotes('')
    loadMarketing()
  }

  const deleteSpend = async (id: string) => {
    const { error } = await supabase.from('ad_spend').delete().eq('id', id)
    if (error) { alert('Could not delete: ' + error.message); return }
    loadMarketing()
  }

  const load = useCallback(async () => {
    setLoading(true)
    // ── Coverage (Supabase counts) ──────────────────────────────────────────
    const countActive = async (build?: (q: any) => any): Promise<Stat> => {
      try {
        let q = supabase.from('listings').select('*', { count: 'exact', head: true }).eq('is_active', true)
        if (build) q = build(q)
        const { count, error } = await q
        return error ? null : (count ?? null)
      } catch { return null }
    }
    const [active, withImage, geocoded, withDesc] = await Promise.all([
      countActive(),
      countActive(q => q.eq('has_image', true)),
      countActive(q => q.not('lat', 'is', null)),
      countActive(q => q.not('description', 'is', null)),
    ])
    let cities: Stat = null
    try {
      const { data } = await supabase.rpc('get_distinct_cities')
      if (Array.isArray(data)) cities = data.length
    } catch { /* ignore */ }
    setCov({ active, withImage, geocoded, withDesc, cities })

    // ── Sitemap health (fetch each sub-sitemap, count <url>, read lastmod) ───
    const results: SiteMap[] = await Promise.all(SUBMAPS.map(async name => {
      try {
        const r = await fetch(`/${name}?cb=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return { name, urls: null, lastmod: null }
        const t = await r.text()
        const urls = (t.match(/<url>/g) || []).length
        const lm = t.match(/<lastmod>([^<]+)<\/lastmod>/)
        return { name, urls, lastmod: lm ? lm[1] : null }
      } catch { return { name, urls: null, lastmod: null } }
    }))
    setMaps(results)

    // ── robots.txt references a sitemap? ────────────────────────────────────
    try {
      const r = await fetch(`/robots.txt?cb=${Date.now()}`, { cache: 'no-store' })
      const t = await r.text()
      setRobotsOk(r.ok && /sitemap:/i.test(t))
    } catch { setRobotsOk(false) }

    setRanAt(new Date().toLocaleString())
    setLoading(false)
  }, [])

  useEffect(() => { if (isAdmin) { load(); loadMarketing() } }, [isAdmin, load, loadMarketing])

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow p-10 text-center max-w-sm">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Admins only</h1>
          <p className="text-gray-500 text-sm">You don't have access to the SEO dashboard.</p>
        </div>
      </div>
    )
  }

  const totalUrls = maps.reduce((s, m) => s + (m.urls || 0), 0)
  const listingsMap = maps.find(m => m.name === 'sitemap-listings.xml')
  const lastBuild = listingsMap?.lastmod || maps.map(m => m.lastmod).filter(Boolean).sort().pop() || null
  const buildFresh = lastBuild ? (Date.now() - new Date(lastBuild).getTime()) < 8 * 864e5 : false

  // ── Automated checklist ───────────────────────────────────────────────────
  const checks: Check[] = [
    { label: 'Per-page canonical tags', level: 'ok',
      detail: 'Set at runtime by useSeo (origin+pathname). No static homepage canonical leaking to every route.' },
    { label: 'No misleading static hreflang', level: 'ok',
      detail: 'Removed; single-URL multilingual handled in-app.' },
    { label: 'robots.txt references sitemap', level: robotsOk == null ? 'todo' : robotsOk ? 'ok' : 'warn',
      detail: robotsOk == null ? 'checking…' : robotsOk ? 'robots.txt is reachable and lists a Sitemap.' : 'robots.txt missing or has no Sitemap line.' },
    { label: 'Sitemap freshly deployed', level: buildFresh ? 'ok' : 'warn',
      detail: lastBuild ? `Last build ${new Date(lastBuild).toLocaleDateString()} (${buildFresh ? 'fresh' : 'stale — check the SEO-weekly deploy'}).` : 'No lastmod found.' },
    { label: 'Structured data (Org / WebSite / per-page)', level: 'ok',
      detail: 'JSON-LD present in index.html + listing pages.' },
    { label: 'Listings geocoded for map/rich results', level: (cov.geocoded && cov.active && cov.geocoded / cov.active > 0.9) ? 'ok' : 'warn',
      detail: `${pct(cov.geocoded, cov.active)} of active listings have lat/lng.` },
    { label: 'Prerendering for bots', level: 'todo',
      detail: 'SPA serves the homepage title/meta to non-JS crawlers until JS runs. Prerender (or SSR) is the deepest remaining organic lever.' },
  ]

  // ── Prioritized action items ──────────────────────────────────────────────
  const actions: Check[] = [
    { label: 'Validate the canonical fix in Search Console', level: 'todo',
      detail: 'Open GSC → Pages → "Duplicate, Google chose different canonical" → Validate Fix (808 pages were affected). Re-crawl takes days.' },
    { label: 'Add prerendering for crawlers', level: 'todo',
      detail: 'Biggest remaining win: bots see homepage meta on every route until JS executes. Consider a prerender step for bot user-agents.' },
    { label: 'Facebook Groups blocked on CI IP', level: 'warn',
      detail: 'Session is valid (Marketplace works, ~49 listings), but group pages redirect to a login/checkpoint from the datacenter IP. Needs a working residential proxy (Webshare is down) + approved group memberships to revive.' },
    { label: 'Madlan disabled (PerimeterX)', level: 'warn',
      detail: 'Blocked by PerimeterX even headful; disabled to save CI. Needs a real anti-bot bypass to revive (~0.7% of listings).' },
    { label: 'Thin-content landing pages', level: 'todo',
      detail: 'Cities with very few listings produce thin pages Google may skip. Coverage improves automatically as the daily scrapers fill them.' },
  ]

  const badge = (lvl: Level) => lvl === 'ok'
    ? <span className="inline-flex items-center gap-1 text-green-700 bg-green-100 text-xs font-semibold px-2 py-0.5 rounded-full">✓ OK</span>
    : lvl === 'warn'
    ? <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-100 text-xs font-semibold px-2 py-0.5 rounded-full">⚠ Attention</span>
    : <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-100 text-xs font-semibold px-2 py-0.5 rounded-full">○ To do</span>

  const Card = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )

  // ── Marketing derived values ──────────────────────────────────────────────
  const totalSpend = adSpend.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const spendByPlatform = AD_PLATFORMS
    .map(p => ({ platform: p, total: adSpend.filter(r => r.platform === p).reduce((s, r) => s + (Number(r.amount) || 0), 0) }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total)
  const acqBySource = Object.entries(
    acq.reduce<Record<string, number>>((m, r) => {
      const s = (r.source || 'direct').toLowerCase(); m[s] = (m[s] || 0) + 1; return m
    }, {}),
  ).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count)
  const signupsTracked = acq.length
  const cpa = signupsTracked ? totalSpend / signupsTracked : null
  const topAcq = acqBySource[0]?.count || 1

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">SEO Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              On-site SEO health & coverage{ranAt && ` · checked ${ranAt}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href={GSC} target="_blank" rel="noreferrer"
               className="text-sm font-medium text-[#1A56DB] bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg">
              Open Search Console ↗
            </a>
            <button onClick={load} disabled={loading}
              className="text-sm font-medium text-white bg-[#1A56DB] hover:bg-blue-700 disabled:opacity-50 px-3 py-2 rounded-lg">
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Coverage */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Coverage</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card label="Active listings" value={fmt(cov.active)} />
            <Card label="Cities live" value={fmt(cov.cities)} sub="in the search dropdown" />
            <Card label="Landing pages" value={cov.cities ? fmt(cov.cities * 2) : '—'} sub="rent + sale per city" />
            <Card label="With photos" value={pct(cov.withImage, cov.active)} sub={fmt(cov.withImage)} />
            <Card label="Geocoded" value={pct(cov.geocoded, cov.active)} sub={fmt(cov.geocoded)} />
          </div>
        </section>

        {/* Marketing & attribution */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Marketing &amp; attribution</h2>

          {mktReady === false ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <div className="font-semibold mb-1">⚙ One-time setup needed</div>
              Run <code className="bg-amber-100 px-1 rounded">supabase/marketing_dashboard.sql</code> in the Supabase
              SQL editor to create the <code>ad_spend</code> and <code>acquisitions</code> tables, then refresh.
              Until then ad-spend tracking and signup attribution are off.
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Card label="Total ad spend" value={ils(totalSpend)} sub={`${adSpend.length} entr${adSpend.length === 1 ? 'y' : 'ies'}`} />
                <Card label="Signups attributed" value={fmt(signupsTracked)} sub="since attribution went live" />
                <Card label="Blended cost / signup" value={cpa == null ? '—' : ils(cpa)} sub="spend ÷ attributed signups" />
                <Card label="Top source" value={acqBySource[0] ? (SOURCE_ICON[acqBySource[0].source] || '•') + ' ' + acqBySource[0].source : '—'} sub={acqBySource[0] ? `${acqBySource[0].count} signups` : 'no data yet'} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Where people come from */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 mb-3">Where signups come from</div>
                  {acqBySource.length === 0 ? (
                    <p className="text-sm text-gray-400">
                      No attributed signups yet. New signups are tagged with their first-touch source
                      (utm / referrer) from now on. Live traffic & sessions also live in{' '}
                      <a href="https://analytics.google.com" target="_blank" rel="noreferrer" className="text-[#1A56DB] hover:underline">Google Analytics ↗</a>.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {acqBySource.map(s => (
                        <div key={s.source} className="flex items-center gap-2 text-sm">
                          <span className="w-28 shrink-0 truncate">{SOURCE_ICON[s.source] || '•'} {s.source}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-[#1A56DB] h-full rounded-full" style={{ width: `${Math.round((s.count / topAcq) * 100)}%` }} />
                          </div>
                          <span className="w-10 text-right tabular-nums text-gray-600">{s.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-3 break-words">
                    First-touch (the source of a user's first visit). Tag your campaign links with
                    <code className="bg-gray-100 px-1 rounded mx-1 break-all">?utm_source=facebook&amp;utm_medium=cpc</code>
                    for clean attribution.
                  </p>
                </div>

                {/* Ad spend manager */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 mb-3">Ad spend</div>

                  {/* Add form */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <select value={nsPlatform} onChange={e => setNsPlatform(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                      {AD_PLATFORMS.map(p => <option key={p} value={p}>{(SOURCE_ICON[p] || '') + ' ' + p}</option>)}
                    </select>
                    <input type="number" min="0" step="1" placeholder="Amount ₪" value={nsAmount}
                      onChange={e => setNsAmount(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                    <input type="text" placeholder="Campaign (optional)" value={nsCampaign}
                      onChange={e => setNsCampaign(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm col-span-2" />
                    <input type="date" value={nsDate} onChange={e => setNsDate(e.target.value)}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                    <button onClick={addSpend} disabled={saving || !(parseFloat(nsAmount) >= 0)}
                      className="bg-[#1A56DB] text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                      {saving ? 'Saving…' : '+ Add spend'}
                    </button>
                  </div>

                  {/* Per-platform totals */}
                  {spendByPlatform.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {spendByPlatform.map(p => (
                        <span key={p.platform} className="text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">
                          {(SOURCE_ICON[p.platform] || '')} {p.platform}: <strong>{ils(p.total)}</strong>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Entries */}
                  {adSpend.length === 0 ? (
                    <p className="text-sm text-gray-400">No spend logged yet. Add what you put into each ad platform above.</p>
                  ) : (
                    <div className="max-h-56 overflow-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {adSpend.map(r => (
                            <tr key={r.id} className="border-t border-gray-50">
                              <td className="px-1 py-1.5 whitespace-nowrap">{(SOURCE_ICON[r.platform] || '')} {r.platform}</td>
                              <td className="px-1 py-1.5 text-gray-500 truncate max-w-[90px]">{r.campaign || '—'}</td>
                              <td className="px-1 py-1.5 text-right tabular-nums font-medium">{ils(Number(r.amount))}</td>
                              <td className="px-1 py-1.5 text-right text-gray-400 whitespace-nowrap">{r.spend_date}</td>
                              <td className="px-1 py-1.5 text-right">
                                <button onClick={() => deleteSpend(r.id)} className="text-gray-300 hover:text-red-500" title="Delete">✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Sitemaps */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
            Sitemaps · {fmt(totalUrls)} URLs total
          </h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[320px]">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr><th className="text-left px-3 py-2">Sitemap</th><th className="text-right px-3 py-2">URLs</th><th className="text-right px-3 py-2">Last build</th></tr>
              </thead>
              <tbody>
                {maps.map(m => (
                  <tr key={m.name} className="border-t border-gray-50">
                    <td className="px-3 py-2">
                      <a href={`${SITE}/${m.name}`} target="_blank" rel="noreferrer" className="text-[#1A56DB] hover:underline break-all">{m.name}</a>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.urls == null ? '—' : m.urls.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{m.lastmod ? m.lastmod.slice(0, 10) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Checklist */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">On-site SEO checklist</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {checks.map(c => (
              <div key={c.label} className="flex items-start gap-3 px-4 py-3">
                <div className="pt-0.5">{badge(c.level)}</div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{c.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Action items */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">What needs to be done</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {actions.map(a => (
              <div key={a.label} className="flex items-start gap-3 px-4 py-3">
                <div className="pt-0.5">{badge(a.level)}</div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{a.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="text-xs text-gray-400 pt-2">
          Live numbers come from Supabase + the deployed sitemaps. GSC indexing status (impressions, coverage errors)
          lives in Search Console — use the button above.
        </p>
      </div>
    </div>
  )
}

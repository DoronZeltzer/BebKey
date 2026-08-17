/**
 * /office-manage — the office owner creates/edits their agency, invites team
 * members, and links their listings to the office (which then appear on the
 * public /office/:slug profile page).
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAgentData } from '../hooks/useAgentData'
import { supabase } from '../lib/supabase'
import { useSeo } from '../hooks/useSeo'
import { getMyOffice, getOfficeMembers, slugify, type Office, type OfficeMember } from '../lib/offices'

const blank = { name: '', city: '', phone: '', bio: '', logo_url: '' }

export default function OfficeManage() {
  useSeo({ title: 'Manage your office' })
  const { user } = useAuth()
  const { agentId } = useAgentData()

  const [office, setOffice]   = useState<Office | null>(null)
  const [members, setMembers] = useState<OfficeMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')
  const [form, setForm]       = useState(blank)
  const [invite, setInvite]   = useState('')

  useEffect(() => {
    if (!user) { setLoading(false); return }
    getMyOffice(user.id).then(o => {
      setOffice(o)
      if (o) {
        setForm({ name: o.name, city: o.city ?? '', phone: o.phone ?? '', bio: o.bio ?? '', logo_url: o.logo_url ?? '' })
        getOfficeMembers(o.id).then(setMembers)
      }
      setLoading(false)
    })
  }, [user])

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function createOffice() {
    if (!user || !form.name.trim()) return
    setSaving(true); setMsg('')
    let slug = slugify(form.name)
    const { data: clash } = await supabase.from('offices').select('id').eq('slug', slug).maybeSingle()
    if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await supabase.from('offices').insert({
      name: form.name.trim(), slug, owner_user_id: user.id,
      city: form.city || null, phone: form.phone || null, bio: form.bio || null, logo_url: form.logo_url || null,
    }).select().single()
    setSaving(false)
    if (error) { setMsg('Could not create office: ' + error.message); return }
    setOffice(data as Office)
    setMsg('Office created.')
  }

  async function saveOffice() {
    if (!office) return
    setSaving(true); setMsg('')
    const { error } = await supabase.from('offices').update({
      name: form.name.trim(), city: form.city || null, phone: form.phone || null,
      bio: form.bio || null, logo_url: form.logo_url || null,
    }).eq('id', office.id)
    setSaving(false)
    setMsg(error ? 'Save failed: ' + error.message : 'Saved.')
    if (!error) setOffice({ ...office, ...form })
  }

  async function addMember() {
    if (!office || !invite.trim()) return
    const email = invite.trim().toLowerCase()
    const { error } = await supabase.from('office_members')
      .insert({ office_id: office.id, email, role: 'agent', status: 'invited' })
    if (error) { setMsg('Invite failed: ' + error.message); return }
    setInvite('')
    getOfficeMembers(office.id).then(setMembers)
  }

  async function removeMember(id: string) {
    await supabase.from('office_members').delete().eq('id', id)
    if (office) getOfficeMembers(office.id).then(setMembers)
  }

  async function linkListings() {
    if (!office) return
    if (!agentId) { setMsg("You don't have any listings to link yet."); return }
    const { error } = await supabase.from('listings').update({ office_id: office.id }).eq('agent_id', agentId)
    setMsg(error ? 'Link failed: ' + error.message : 'Your listings are now linked to the office.')
  }

  if (!user) return <div className="max-w-2xl mx-auto py-16 px-4 text-center text-gray-500">Please log in to manage your office.</div>
  if (loading) return <div className="max-w-2xl mx-auto py-16 px-4"><div className="h-40 bg-gray-100 rounded-2xl animate-pulse" /></div>

  const field = (label: string, k: keyof typeof blank, ph = '', textarea = false) => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      {textarea ? (
        <textarea value={form[k]} onChange={set(k)} placeholder={ph} rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
      ) : (
        <input value={form[k]} onChange={set(k)} placeholder={ph}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
      )}
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{office ? 'Your office' : 'Create your office'}</h1>
        <Link to="/dashboard" className="text-sm text-brand-blue hover:underline">← Dashboard</Link>
      </div>

      {msg && <div className="mb-4 text-sm bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2">{msg}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        {field('Office name', 'name', 'e.g. Cohen Realty')}
        <div className="grid sm:grid-cols-2 gap-4">
          {field('City', 'city', 'Tel Aviv')}
          {field('Phone', 'phone', '050-000-0000')}
        </div>
        {field('Logo URL', 'logo_url', 'https://…')}
        {field('About the office', 'bio', 'Short description shown on your public page', true)}

        <div className="flex items-center gap-3 pt-1">
          {office ? (
            <button onClick={saveOffice} disabled={saving}
              className="bg-brand-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          ) : (
            <button onClick={createOffice} disabled={saving || !form.name.trim()}
              className="bg-brand-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create office'}
            </button>
          )}
          {office && (
            <Link to={`/office/${office.slug}`} className="text-sm text-brand-blue hover:underline">
              View public page →
            </Link>
          )}
        </div>
      </div>

      {office && (
        <>
          {/* Listings link */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mt-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900 text-sm">Listings</p>
              <p className="text-xs text-gray-500">Attach your active listings to this office so they show on its profile.</p>
            </div>
            <button onClick={linkListings}
              className="shrink-0 text-sm font-semibold bg-gray-900 text-white px-3 py-2 rounded-lg hover:bg-black">
              Link my listings
            </button>
          </div>

          {/* Team */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mt-4">
            <p className="font-semibold text-gray-900 mb-3">Team</p>
            <div className="flex gap-2 mb-4">
              <input value={invite} onChange={e => setInvite(e.target.value)} placeholder="agent@email.com" type="email"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
              <button onClick={addMember} disabled={!invite.trim()}
                className="bg-brand-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                Invite
              </button>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-gray-400">No team members yet.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {members.map(m => (
                  <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-gray-700">{m.email}</span>
                    <span className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {m.status}
                      </span>
                      <button onClick={() => removeMember(m.id)} className="text-gray-300 hover:text-red-500" title="Remove">✕</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

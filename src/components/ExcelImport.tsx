import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { CITY_TRANSLATIONS } from '../lib/cityNames'

// Map English city names back to Hebrew (for matching Excel input)
const EN_TO_HE: Record<string, string> = {}
for (const [he, translations] of Object.entries(CITY_TRANSLATIONS)) {
  if (translations.en) EN_TO_HE[translations.en.toLowerCase()] = he
  EN_TO_HE[he] = he  // Hebrew input also works
}

function resolveCity(raw: string): string {
  const lower = raw.trim().toLowerCase()
  return EN_TO_HE[lower] ?? raw.trim()
}

function parseCities(raw: string | undefined): string[] {
  if (!raw) return []
  return String(raw).split(/[,;|]+/).map(c => resolveCity(c)).filter(Boolean)
}

interface Props {
  agentId: string
  onClose: () => void
  onImported: (count: number) => void
}

interface PreviewRow {
  client_name: string
  phone: string
  budget_min: number | null
  budget_max: number | null
  preferred_cities: string[]
  min_rooms: number | null
  notes: string
}

export default function ExcelImport({ agentId, onClose, onImported }: Props) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

        const parsed: PreviewRow[] = rows.map(row => {
          // Flexible column name matching (English or Hebrew headers)
          const name =
            row['Name'] || row['name'] || row['Full Name'] || row['Client'] ||
            row['שם'] || row['שם לקוח'] || ''

          const phone =
            row['Phone'] || row['phone'] || row['Mobile'] || row['טלפון'] || row['נייד'] || ''

          const budgetMin = parseFloat(
            row['Budget Min'] || row['budget_min'] || row['Min Budget'] ||
            row['תקציב מינימלי'] || row['תקציב מינ'] || ''
          )
          const budgetMax = parseFloat(
            row['Budget Max'] || row['budget_max'] || row['Max Budget'] ||
            row['תקציב מקסימלי'] || row['תקציב מקס'] || ''
          )
          const citiesRaw =
            row['Cities'] || row['City'] || row['Preferred Cities'] ||
            row['ערים'] || row['עיר'] || ''

          const minRooms = parseFloat(
            row['Min Rooms'] || row['Rooms'] || row['min_rooms'] ||
            row['חדרים'] || row['חדרים מינימום'] || ''
          )

          const notes =
            row['Notes'] || row['notes'] || row['Comments'] ||
            row['הערות'] || row['הערה'] || ''

          return {
            client_name: String(name).trim(),
            phone: String(phone).trim(),
            budget_min: !isNaN(budgetMin) && budgetMin > 0 ? budgetMin : null,
            budget_max: !isNaN(budgetMax) && budgetMax > 0 ? budgetMax : null,
            preferred_cities: parseCities(String(citiesRaw)),
            min_rooms: !isNaN(minRooms) && minRooms > 0 ? minRooms : null,
            notes: String(notes).trim(),
          }
        }).filter(r => r.client_name.length > 0)

        if (parsed.length === 0) {
          setError(t('excelImport.errorNoClients'))
          setPreview([])
          return
        }
        setPreview(parsed)
      } catch {
        setError(t('excelImport.errorRead'))
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    if (!preview.length) return
    setImporting(true); setError('')

    const payload = preview.map(r => ({
      agent_id: agentId,
      client_name: r.client_name,
      phone: r.phone || null,
      budget_min: r.budget_min,
      budget_max: r.budget_max,
      preferred_cities: r.preferred_cities.length ? r.preferred_cities : null,
      min_rooms: r.min_rooms,
      notes: r.notes || null,
      is_active: true,
    }))

    const { error: err } = await supabase.from('agent_clients').insert(payload)
    setImporting(false)
    if (err) { setError(err.message); return }
    onImported(preview.length)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">{t('excelImport.title')}</h2>
          <button onClick={onClose} aria-label={t('excelImport.close')} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Template download hint */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
            <p className="font-semibold mb-1">{t('excelImport.expectedColumns')}</p>
            <p className="font-mono text-xs text-blue-700">
              Name | Phone | Budget Min | Budget Max | Cities | Min Rooms | Notes
            </p>
            <p className="text-xs text-blue-600 mt-1">{t('excelImport.citiesHint')}</p>
          </div>

          {/* File picker */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-blue transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {fileName
              ? <p className="text-sm font-medium text-brand-blue">{fileName}</p>
              : <p className="text-sm text-gray-500">{t('excelImport.uploadHint')}</p>
            }
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          {/* Preview table */}
          {preview.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                {t('excelImport.previewCount', { count: preview.length })}
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {([
                        ['name', t('excelImport.colName')],
                        ['phone', t('excelImport.colPhone')],
                        ['budget', t('excelImport.colBudget')],
                        ['cities', t('excelImport.colCities')],
                        ['rooms', t('excelImport.colRooms')],
                        ['notes', t('excelImport.colNotes')],
                      ] as const).map(([key, label]) => (
                        <th key={key} className="px-3 py-2 text-left font-semibold text-gray-600">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.slice(0, 10).map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{r.client_name}</td>
                        <td className="px-3 py-2 text-gray-500">{r.phone || '-'}</td>
                        <td className="px-3 py-2 text-gray-500">
                          {r.budget_min || r.budget_max
                            ? `₪${(r.budget_min ?? 0).toLocaleString()} - ₪${(r.budget_max ?? '∞').toLocaleString()}`
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {r.preferred_cities.length ? r.preferred_cities.join(', ') : '-'}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{r.min_rooms ?? '-'}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{r.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 10 && (
                  <p className="text-xs text-gray-400 px-3 py-2">
                    {t('excelImport.moreRows', { count: preview.length - 10 })}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={!preview.length || importing}
              className="flex-1 py-2.5 bg-brand-blue text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-40"
            >
              {importing ? t('excelImport.importing') : t('excelImport.importCount', { count: preview.length })}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition"
            >
              {t('excelImport.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

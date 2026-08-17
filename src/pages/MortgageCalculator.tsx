/**
 * /mortgage-calculator
 *
 * Israeli-specific mortgage (mashkanta) calculator covering:
 *   - Loan-to-value caps by buyer type (first home / move-up / investor)
 *   - Monthly payment via standard amortization (PMT)
 *   - Mas Rechisha (purchase tax) by 2026 brackets:
 *       Israeli citizen first home / move-up / investor / Oleh (reduced)
 *   - Total upfront cost breakdown (deposit + tax + closing fees)
 *   - 30-year mortgage cost projection
 *
 * Counter to keyz.ai's bundled mortgage adviser - except ours works
 * on top of 20,000+ aggregated listings (every listing's "Calculate
 * mortgage" CTA pre-fills the price field here).
 */
import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useSeo } from '../hooks/useSeo'

// ── 2026 Mas Rechisha brackets ──────────────────────────────────────────────
// Numbers as of 2026 update (Israel Tax Authority - review periodically).
// All in NIS.  Returns tax in NIS.
function calcMasRechisha(
  price: number,
  buyerType: 'first_home' | 'move_up' | 'investor' | 'oleh',
): number {
  if (price <= 0) return 0

  if (buyerType === 'first_home') {
    // Brackets for Israeli citizen buying a single primary residence
    const brackets: [number, number][] = [
      [1_978_745, 0.00],
      [2_347_040, 0.035],
      [6_055_070, 0.05],
      [20_183_565, 0.08],
      [Infinity, 0.10],
    ]
    return computeBrackets(price, brackets)
  }
  if (buyerType === 'move_up') {
    // Selling an existing primary residence to buy a new one
    return calcMasRechisha(price, 'first_home')
  }
  if (buyerType === 'oleh') {
    // Olim get reduced rates on a single residence within 7 years of aliyah.
    // 0.5% on the first ~₪2M, 5% above (approximate; consult an attorney).
    const oleh: [number, number][] = [
      [2_000_000, 0.005],
      [Infinity, 0.05],
    ]
    return computeBrackets(price, oleh)
  }
  // Investor / second property - much higher rates
  const investor: [number, number][] = [
    [6_055_070, 0.08],
    [Infinity, 0.10],
  ]
  return computeBrackets(price, investor)
}

function computeBrackets(price: number, brackets: [number, number][]): number {
  let total = 0
  let prev = 0
  for (const [ceiling, rate] of brackets) {
    if (price <= prev) break
    const taxable = Math.min(price, ceiling) - prev
    if (taxable > 0) total += taxable * rate
    prev = ceiling
    if (price <= ceiling) break
  }
  return Math.round(total)
}

// ── LTV caps by buyer type (Bank of Israel regulation) ─────────────────────
const LTV_CAP: Record<string, number> = {
  first_home: 0.75,
  move_up:    0.70,
  investor:   0.50,
  oleh:       0.75,
}

// ── PMT - standard amortization formula ─────────────────────────────────────
function monthlyPayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0
  const n = years * 12
  const r = annualRate / 12
  if (r === 0) return principal / n
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

const fmt = (n: number) => Math.round(n).toLocaleString('he-IL')

export default function MortgageCalculator() {
  const { t } = useTranslation()
  const [params] = useSearchParams()

  // Pre-fill price from ?price=... when arriving from a listing's CTA
  const [price, setPrice]               = useState(2_000_000)
  const [downPaymentPct, setDownPct]    = useState(25)
  const [years, setYears]               = useState(30)
  const [annualRate, setAnnualRate]     = useState(5.5)  // ~average 2026 effective rate
  const [buyerType, setBuyerType]       = useState<'first_home' | 'move_up' | 'investor' | 'oleh'>('first_home')

  useEffect(() => {
    const p = params.get('price')
    if (p) {
      const n = parseInt(p, 10)
      if (n > 100_000) setPrice(n)
    }
  }, [params])

  useSeo({
    title: 'Mortgage Calculator Israel (Mashkanta) - BebKey',
    description: 'Free Israeli mortgage calculator with Mas Rechisha (purchase tax), olim rates, LTV caps, and total cost projection. Works for any listing on BebKey.',
    url: 'https://www.bebkey.com/mortgage-calculator',
  })

  // WebApplication JSON-LD.  Signals to Google that this URL is an
  // interactive tool (not a static article) so it can be indexed with a
  // "Free tool" tag in the SERP and — importantly — get surfaced by
  // Google's "tools & calculators" feature for queries like
  // "מחשבון משכנתא", "Israel mortgage calculator", "mas rechisha calc".
  useEffect(() => {
    const schema = {
      '@context': 'https://schema.org',
      '@type':    'WebApplication',
      name:       'Israeli Mortgage & Mas Rechisha Calculator',
      description: 'Free calculator for Israeli mortgages (mashkanta): LTV brackets, monthly payment, total interest, plus Mas Rechisha purchase-tax projection with olim reductions.',
      url:               'https://www.bebkey.com/mortgage-calculator',
      applicationCategory: 'FinanceApplication',
      operatingSystem:   'Any (browser)',
      inLanguage:        ['he', 'en', 'ru', 'ar', 'fr'],
      offers: {
        '@type': 'Offer',
        price:  '0',
        priceCurrency: 'ILS',
      },
      publisher: {
        '@type': 'Organization',
        name:    'BebKey',
        url:     'https://www.bebkey.com',
      },
    }
    let el = document.getElementById('mortgage-calc-jsonld') as HTMLScriptElement | null
    if (!el) {
      el = document.createElement('script')
      el.id = 'mortgage-calc-jsonld'
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(schema)
    return () => { el?.remove() }
  }, [])

  const calc = useMemo(() => {
    const ltvCap     = LTV_CAP[buyerType]
    const requestedDownPct = downPaymentPct / 100
    const effectiveDownPct = Math.max(requestedDownPct, 1 - ltvCap)
    const downPayment      = Math.round(price * effectiveDownPct)
    const loan             = price - downPayment
    const monthlyP         = monthlyPayment(loan, annualRate / 100, years)
    const totalPaid        = monthlyP * years * 12
    const totalInterest    = totalPaid - loan
    const masRechisha      = calcMasRechisha(price, buyerType)

    // Closing fees (rough estimates)
    const lawyerFee        = Math.round(price * 0.0075 * 1.17)         // 0.75% + 17% VAT
    const agentFee         = Math.round(price * 0.02   * 1.17)         // 2% + VAT (only if used)
    const bankFee          = 1500
    const appraisalFee     = 2000
    const totalClosing     = lawyerFee + bankFee + appraisalFee        // agent excluded
    const totalUpfront     = downPayment + masRechisha + totalClosing

    return {
      ltvCap, effectiveDownPct, downPayment, loan, monthlyP,
      totalPaid, totalInterest, masRechisha,
      lawyerFee, agentFee, bankFee, appraisalFee, totalClosing, totalUpfront,
    }
  }, [price, downPaymentPct, years, annualRate, buyerType])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl md:text-4xl font-extrabold mb-2 text-gray-900">
        {t('mortgage.title')}
      </h1>
      <p className="text-gray-600 mb-8">
        {t('mortgage.subtitle')}
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* ─── Inputs ─── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          <h2 className="font-bold text-lg text-gray-800">{t('mortgage.yourScenario')}</h2>

          <NumField
            label={t('mortgage.propertyPrice')}
            value={price} onChange={setPrice}
            step={1} min={100_000} max={500_000_000}
          />

          <RangeField
            label={t('mortgage.downPayment')}
            value={downPaymentPct} onChange={setDownPct}
            min={10} max={100} step={0.5}
            hint={t('mortgage.downPaymentHint', {
              amount:   fmt(calc.downPayment),
              effective: Math.round(calc.effectiveDownPct * 100),
              ltvCap:   Math.round(calc.ltvCap * 100),
            })}
          />

          <RangeField
            label={t('mortgage.loanTerm')}
            value={years} onChange={setYears}
            min={4} max={30} step={1}
          />

          <RangeField
            label={t('mortgage.annualRate')}
            value={annualRate} onChange={setAnnualRate}
            min={2} max={15} step={0.05}
            hint={t('mortgage.annualRateHint')}
          />

          {/* Buyer type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('mortgage.buyerType')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['first_home', t('mortgage.buyerFirstHome')],
                ['move_up',    t('mortgage.buyerMoveUp')],
                ['investor',   t('mortgage.buyerInvestor')],
                ['oleh',       t('mortgage.buyerOleh')],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setBuyerType(key)}
                  className={
                    'py-2 px-3 rounded-lg text-sm font-medium transition border ' +
                    (buyerType === key
                      ? 'bg-brand-blue text-white border-brand-blue'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')
                  }
                >{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Outputs ─── */}
        <div className="space-y-4">
          {/* Monthly payment highlight */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl shadow-md p-6 text-white">
            <p className="text-sm font-semibold opacity-90 mb-1">
              {t('mortgage.monthlyPayment')}
            </p>
            <p className="text-4xl font-extrabold">
              ₪{fmt(calc.monthlyP)}
            </p>
            <p className="text-sm opacity-80 mt-2">
              {t('mortgage.monthlyPaymentDesc', { loan: fmt(calc.loan), years })}
            </p>
          </div>

          {/* Cost breakdown */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-base text-gray-800 mb-3">
              {t('mortgage.totalTransactionCost')}
            </h3>
            <Row label={t('mortgage.downPaymentLabel')} value={calc.downPayment} />
            <Row label={t('mortgage.masRechisha')}      value={calc.masRechisha} />
            <Row label={t('mortgage.lawyer')}           value={calc.lawyerFee} />
            <Row label={t('mortgage.bankFee')}          value={calc.bankFee} />
            <Row label={t('mortgage.appraisal')}        value={calc.appraisalFee} />
            <hr className="my-3" />
            <Row label={t('mortgage.totalUpfront')}     value={calc.totalUpfront} bold />
            <Row label={t('mortgage.totalInterest')}    value={calc.totalInterest} />
            <Row label={t('mortgage.grandTotal')}       value={calc.totalUpfront - calc.downPayment + calc.totalPaid + calc.downPayment} bold />
          </div>

          {/* Agent fee note */}
          <p className="text-xs text-gray-500 px-2">
            {t('mortgage.agentFeeNote', { amount: fmt(calc.agentFee) })}
          </p>
        </div>
      </div>

      {/* ── Disclaimer ── */}
      <div className="mt-10 bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-900">
        <strong className="font-semibold">
          {t('mortgage.disclaimerTitle')}{' '}
        </strong>
        {t('mortgage.disclaimerBody')}
      </div>

      {/* ── Guide CTAs ── */}
      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <a
          href="/guides/israeli-mortgage-mashkanta-guide"
          className="block bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition"
        >
          <p className="text-sm font-semibold text-brand-blue mb-1">
            {t('mortgage.guideMortgageTitle')}
          </p>
          <p className="text-xs text-gray-600">
            {t('mortgage.guideMortgageDesc')}
          </p>
        </a>
        <a
          href="/guides/mas-rechisha-purchase-tax"
          className="block bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition"
        >
          <p className="text-sm font-semibold text-brand-blue mb-1">
            {t('mortgage.guideMasRechishaTitle')}
          </p>
          <p className="text-xs text-gray-600">
            {t('mortgage.guideMasRechishaDesc')}
          </p>
        </a>
      </div>
    </div>
  )
}

// ─── Small helper components ────────────────────────────────────────────────
function NumField({
  label, value, onChange, step, min, max,
}: { label: string; value: number; onChange: (n: number) => void; step: number; min: number; max: number }) {
  // Free-typing draft: the user can clear the field and type any number without
  // each keystroke snapping to min/max (the old onChange clamped on every key,
  // so typing a leading digit jumped the value to 100,000). We update the live
  // value as they type (no min-clamp) and only fully clamp on blur / Enter.
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setDraft(String(value)) }, [value])
  const commit = () => {
    focused.current = false
    const n = Number(draft.replace(/,/g, ''))
    if (draft.trim() === '' || Number.isNaN(n)) { setDraft(String(value)); return }
    const clamped = Math.max(min, Math.min(max, n))
    onChange(clamped)
    setDraft(String(clamped))
  }
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        value={draft}
        onFocus={() => { focused.current = true }}
        onChange={(e) => {
          const raw = e.target.value
          setDraft(raw)
          const n = Number(raw)
          if (raw.trim() !== '' && !Number.isNaN(n)) onChange(Math.min(max, Math.max(0, n)))
        }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        step={step} min={min} max={max}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />
    </div>
  )
}

function RangeField({
  label, value, onChange, min, max, step, hint,
}: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step: number; hint?: string }) {
  // Free-typing draft (same fix as NumField): the number box no longer snaps
  // mid-typing. The displayed text follows what's typed; the live value is
  // clamped for calc safety; blur commits the final clamp.
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setDraft(String(value)) }, [value])
  const commit = () => {
    focused.current = false
    const n = Number(draft)
    if (draft.trim() === '' || Number.isNaN(n)) { setDraft(String(value)); return }
    const clamped = Math.max(min, Math.min(max, n))
    onChange(clamped)
    setDraft(String(clamped))
  }
  return (
    <div>
      <div className="flex justify-between items-center text-sm font-semibold text-gray-700 mb-1">
        <span>{label}</span>
        <input
          type="number"
          inputMode="decimal"
          value={draft}
          onFocus={() => { focused.current = true }}
          onChange={(e) => {
            const raw = e.target.value
            setDraft(raw)
            const n = Number(raw)
            if (raw.trim() !== '' && !Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)))
          }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          step="any"
          min={min}
          max={max}
          className="w-24 px-2 py-0.5 border border-gray-200 rounded-md text-end font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min} max={max} step={step}
        className="w-full accent-brand-blue"
      />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? 'font-bold text-gray-900' : 'text-sm text-gray-700'}`}>
      <span>{label}</span>
      <span>₪{fmt(value)}</span>
    </div>
  )
}

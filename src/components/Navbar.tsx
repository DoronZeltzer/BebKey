import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
// Accessibility icon SVG inline - no extra dependency needed
const A11yIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
    <circle cx="12" cy="4" r="2" />
    <path d="M19 7.5l-7 1-7-1-.5 2 5 .8L8 17l2.5 1 1.5-4 1.5 4 2.5-1-1.5-6.7 5-.8z" />
  </svg>
)
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { ADMIN_EMAILS } from '../lib/adminEmails'

const LANGUAGES = [
  { code: 'he', label: 'עברית' },
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
]

export default function Navbar() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

  function changeLang(code: string) {
    i18n.changeLanguage(code)
    localStorage.setItem('lang', code)
    document.documentElement.dir = code === 'he' || code === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = code
    setLangOpen(false)
  }

  async function handleSignOut() {
    await signOut()
    setUserOpen(false)
    navigate('/')
  }

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0]
  const userInitial = user?.email?.charAt(0).toUpperCase() ?? '?'
  const userEmail = user?.email ?? ''
  const userRole = (user?.user_metadata?.role as string | undefined) ?? ''
  const isAdmin = !!user?.email && ADMIN_EMAILS.has(user.email)

  return (
    <nav className="bg-brand-blue text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Wordmark - the bk monogram lives in the favicon (browser tab),
            the navbar just shows the bebkey wordmark in the brand colours. */}
        {/* dir="ltr" so the two-tone "BebKey" wordmark never reverses to
            "KeyBeb" under the app's RTL (Hebrew/Arabic) direction. */}
        <Link to="/" dir="ltr" className="flex items-center font-bold text-xl tracking-tight" aria-label="BebKey home">
          <span className="text-white">Beb</span>
          <span className="text-brand-orange">Key</span>
        </Link>

        {/* Desktop nav links - shown at lg (1024px+) only.  Below that the
            hamburger menu takes over.  Previously we used md (768px) but
            the ~10 nav items wrapped to a second line on tablets and small
            laptops, looking broken.  whitespace-nowrap on each link keeps
            multi-word labels like "Open Houses" from breaking mid-link. */}
        <div className="hidden lg:flex items-center gap-4 text-sm font-medium">
          <Link to="/search" className="hover:text-brand-orange transition-colors whitespace-nowrap">
            {t('nav.search')}
          </Link>
          <Link to="/mortgage-calculator" className="hover:text-brand-orange transition-colors whitespace-nowrap">
            {t('nav.mortgage') || 'Mortgage'}
          </Link>
          <Link to="/guides" className="hover:text-brand-orange transition-colors whitespace-nowrap">
            {t('nav.guides') || 'Guides'}
          </Link>
          <Link to="/compare" className="hover:text-brand-orange transition-colors whitespace-nowrap">
            {t('nav.compare') || 'Compare'}
          </Link>
          {user && (
            <Link to="/market" className="hover:text-brand-orange transition-colors whitespace-nowrap">
              {t('nav.market') || 'Market'}
            </Link>
          )}
          {user && (
            <Link to="/saved" className="hover:text-brand-orange transition-colors flex items-center gap-1 whitespace-nowrap">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              {t('nav.saved')}
            </Link>
          )}
          {user && (
            <Link to="/dashboard" className="hover:text-brand-orange transition-colors whitespace-nowrap">
              {t('nav.dashboard')}
            </Link>
          )}
          {!user && (
            <Link to="/register" className="hover:text-brand-orange transition-colors whitespace-nowrap">
              {t('nav.forAgents')}
            </Link>
          )}
          <Link to="/pricing" className="hover:text-brand-orange transition-colors whitespace-nowrap">
            {t('nav.pricing')}
          </Link>
          {isAdmin && (
            <Link to="/admin" className="text-brand-orange hover:opacity-80 transition-opacity font-medium whitespace-nowrap">
              Admin
            </Link>
          )}
        </div>

        {/* Right side: language + auth - same lg: breakpoint */}
        <div className="hidden lg:flex items-center gap-3 text-sm">
          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => { setLangOpen((o) => !o); setUserOpen(false) }}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-700 transition-colors"
            >
              <span>{currentLang.label}</span>
              <span className="text-xs">▾</span>
            </button>
            {langOpen && (
              <div className="absolute top-8 end-0 bg-white text-gray-800 rounded shadow-lg z-50 min-w-[130px]">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => changeLang(lang.code)}
                    className={`block w-full text-start px-4 py-2 text-sm hover:bg-gray-100 ${
                      i18n.language === lang.code ? 'font-semibold text-brand-blue' : ''
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Auth section */}
          {user ? (
            /* Logged-in: avatar + dropdown */
            <div className="relative">
              <button
                onClick={() => { setUserOpen((o) => !o); setLangOpen(false) }}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-blue-700 transition-colors"
              >
                <div className="w-7 h-7 bg-brand-orange rounded-full flex items-center justify-center text-gray-900 text-xs font-bold">
                  {userInitial}
                </div>
                <span className="text-xs max-w-[70px] sm:max-w-[100px] truncate opacity-90">{userEmail}</span>
                <span className="text-xs">▾</span>
              </button>
              {userOpen && (
                <div className="absolute top-10 end-0 bg-white text-gray-800 rounded-xl shadow-lg z-50 min-w-[180px] py-1 overflow-hidden">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-800 truncate">{userEmail}</p>
                    {userRole && (
                      <p className="text-xs text-gray-600 capitalize">{userRole}</p>
                    )}
                  </div>
                  <Link
                    to="/dashboard"
                    onClick={() => setUserOpen(false)}
                    className="block px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
                  >
                    {t('nav.dashboard')}
                  </Link>
                  <Link
                    to="/saved"
                    onClick={() => setUserOpen(false)}
                    className="block px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
                  >
                    {t('nav.saved')}
                  </Link>
                  <Link
                    to="/profile"
                    onClick={() => setUserOpen(false)}
                    className="block px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
                  >
                    {t('nav.profileSettings')}
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setUserOpen(false)}
                      className="block px-4 py-2 text-sm text-brand-orange font-medium hover:bg-orange-50 transition-colors"
                    >
                      {t('nav.adminPanel')}
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="block w-full text-start px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                  >
                    {t('nav.logout')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Logged-out: Login + Register */
            <>
              <Link
                to="/login"
                className="px-3 py-1.5 rounded border border-white/40 hover:bg-blue-700 transition-colors"
              >
                {t('nav.login')}
              </Link>
              <Link
                to="/register"
                className="px-3 py-1.5 rounded bg-brand-orange hover:bg-orange-500 text-gray-900 font-semibold transition-colors"
              >
                {t('nav.register')}
              </Link>
            </>
          )}
        </div>

        {/* Mobile + tablet hamburger - shown at lg (1024px) and below */}
        <button
          className="lg:hidden p-2 rounded hover:bg-blue-700"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <span className="block w-5 h-0.5 bg-white mb-1"></span>
          <span className="block w-5 h-0.5 bg-white mb-1"></span>
          <span className="block w-5 h-0.5 bg-white"></span>
        </button>
      </div>

      {/* Accessibility quick-link bar removed per request — the statement stays
          reachable via the footer link, the mobile menu, and the floating
          accessibility widget (the circle), so legal compliance is unaffected. */}

      {/* Mobile + tablet drawer menu */}
      {menuOpen && (
        <div className="lg:hidden bg-blue-800 px-4 pb-4 flex flex-col gap-3 text-sm">
          <Link to="/search" onClick={() => setMenuOpen(false)} className="py-2 border-b border-blue-700">
            {t('nav.search')}
          </Link>
          <Link to="/mortgage-calculator" onClick={() => setMenuOpen(false)} className="py-2 border-b border-blue-700">
            {t('nav.mortgage') || 'Mortgage'}
          </Link>
          <Link to="/compare" onClick={() => setMenuOpen(false)} className="py-2 border-b border-blue-700">
            {t('nav.compare') || 'Compare'}
          </Link>
          {user ? (
            <>
              <Link to="/dashboard" onClick={() => setMenuOpen(false)} className="py-2 border-b border-blue-700">
                {t('nav.dashboard')}
              </Link>
              <Link to="/saved" onClick={() => setMenuOpen(false)} className="py-2 border-b border-blue-700 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                {t('nav.saved')}
              </Link>
            </>
          ) : (
            <Link to="/register" onClick={() => setMenuOpen(false)} className="py-2 border-b border-blue-700">
              {t('nav.forAgents')}
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" onClick={() => setMenuOpen(false)} className="py-2 border-b border-blue-700 text-brand-orange font-medium">
              {t('nav.adminPanel')}
            </Link>
          )}
          {user && (
            <Link to="/market" onClick={() => setMenuOpen(false)} className="py-2 border-b border-blue-700">
              {t('nav.market') || 'Market'}
            </Link>
          )}
          <Link to="/pricing" onClick={() => setMenuOpen(false)} className="py-2 border-b border-blue-700">
            {t('nav.pricing')}
          </Link>
          <Link to="/guides" onClick={() => setMenuOpen(false)} className="py-2 border-b border-blue-700">
            {t('nav.guides') || 'Guides'}
          </Link>
          <Link to="/blog" onClick={() => setMenuOpen(false)} className="py-2 border-b border-blue-700">
            {t('nav.blog') || 'Blog'}
          </Link>
          <Link to="/accessibility" onClick={() => setMenuOpen(false)} className="py-2 border-b border-blue-700 flex items-center gap-1.5">
            <A11yIcon />
            {t('a11y.statementLink')}
          </Link>

          {/* Language buttons */}
          <div className="flex gap-2 pt-1">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { changeLang(lang.code); setMenuOpen(false) }}
                className={`text-xs px-2 py-1 rounded ${i18n.language === lang.code ? 'bg-brand-orange' : 'bg-blue-700'}`}
              >
                {lang.code.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Auth */}
          {user ? (
            <div className="flex flex-col gap-2 pt-1">
              <p className="text-xs opacity-70 truncate">{userEmail}</p>
              <button
                onClick={() => { handleSignOut(); setMenuOpen(false) }}
                className="py-2 bg-red-500/20 text-red-300 rounded text-sm font-medium"
              >
                {t('nav.logout')}
              </button>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <Link to="/login" onClick={() => setMenuOpen(false)} className="flex-1 text-center py-2 border border-white/40 rounded">
                {t('nav.login')}
              </Link>
              <Link to="/register" onClick={() => setMenuOpen(false)} className="flex-1 text-center py-2 bg-brand-orange text-gray-900 rounded font-semibold">
                {t('nav.register')}
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  )
}

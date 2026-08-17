import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { captureFirstTouch } from './lib/acquisition'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import GoogleAnalytics from './components/GoogleAnalytics'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import ScrollToTop from './components/ScrollToTop'
import CookieBanner, { useCookieConsent, openCookiePreferences } from './components/CookieBanner'
import InstallPrompt from './components/InstallPrompt'
import AccessibilityWidget from './components/AccessibilityWidget'
import { BkMonogram } from './components/Logo'

// Eagerly loaded - the absolute critical path:
//   - Home: landing page (most ad traffic lands here)
//   - Login + Register: must feel instant during auth flow
//   - AuthCallback: tiny, just routes OAuth redirects
//   - NotFound: tiny, no point in code-splitting
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import AuthCallback from './pages/AuthCallback'
import NotFound from './pages/NotFound'

// Lazy loaded - heavy pages users navigate to AFTER seeing the homepage.
// Lazy-loading these dropped the main bundle from 504 KiB to ~290 KiB,
// improving Lighthouse LCP from 3.9s to ~2.5s on the homepage.
const Search        = lazy(() => import('./pages/Search'))
const ListingDetail = lazy(() => import('./pages/ListingDetail'))

// Lazy loaded - reduces initial bundle for non-critical paths
const Dashboard       = lazy(() => import('./pages/Dashboard'))
const Submit          = lazy(() => import('./pages/Submit'))
const Profile         = lazy(() => import('./pages/Profile'))
const Pricing         = lazy(() => import('./pages/Pricing'))
const Admin           = lazy(() => import('./pages/Admin'))
const SeoCheck        = lazy(() => import('./pages/SeoCheck'))
const SavedListings   = lazy(() => import('./pages/SavedListings'))
const CheckoutSuccess = lazy(() => import('./pages/CheckoutSuccess'))
const CheckoutCancel  = lazy(() => import('./pages/CheckoutCancel'))
const Terms           = lazy(() => import('./pages/Terms'))
const Privacy         = lazy(() => import('./pages/Privacy'))
const Refund          = lazy(() => import('./pages/Refund'))
const Accessibility   = lazy(() => import('./pages/Accessibility'))
const NeighborhoodInsights = lazy(() => import('./pages/NeighborhoodInsights'))
const CityLanding          = lazy(() => import('./pages/CityLanding'))
const MortgageCalculator   = lazy(() => import('./pages/MortgageCalculator'))
const CityCompare          = lazy(() => import('./pages/CityCompare'))
const NeighborhoodsCity    = lazy(() => import('./pages/NeighborhoodsCity'))
const SeoLanding           = lazy(() => import('./pages/SeoLanding'))
const AgentProfile         = lazy(() => import('./pages/AgentProfile'))
const OfficeProfile        = lazy(() => import('./pages/OfficeProfile'))
const OfficeManage         = lazy(() => import('./pages/OfficeManage'))
const Blog                 = lazy(() => import('./pages/Blog'))
const BlogPost             = lazy(() => import('./pages/BlogPost'))
const Guides               = lazy(() => import('./pages/Guides'))
const Guide                = lazy(() => import('./pages/Guide'))
const Contact              = lazy(() => import('./pages/Contact'))
const Help                 = lazy(() => import('./pages/Help'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <svg className="animate-spin w-6 h-6 text-brand-blue" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    </div>
  )
}

function KickedOutBanner() {
  const { kickedOut } = useAuth()
  const { t } = useTranslation()
  const { pathname } = useLocation()
  // Don't show the banner when the user is already on the login/register page
  if (!kickedOut || pathname === '/login' || pathname === '/register') return null
  return (
    <div className="bg-red-600 text-white text-sm px-4 py-3 flex items-center justify-center gap-2 text-center">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      {t('common.kickedOut')}
      <Link to="/login" className="underline font-semibold hover:opacity-80 ml-1">{t('common.signInAgain')}</Link>
    </div>
  )
}

function AppInner() {
  const { t } = useTranslation()
  // Record where this visitor first arrived from (utm / referrer) once per
  // browser, so signups can be attributed to a source in the admin dashboard.
  useEffect(() => { captureFirstTouch() }, [])
  return (
    <>
      <ScrollToTop />
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <KickedOutBanner />
        <Navbar />
        <CookieBanner />
        <InstallPrompt />
        <AccessibilityWidget />
        <main className="flex-1">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<Search />} />
              <Route path="/listing/:id" element={<ListingDetail />} />
              <Route path="/office/:slug" element={<OfficeProfile />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/checkout/success" element={<CheckoutSuccess />} />
              <Route path="/checkout/cancel" element={<CheckoutCancel />} />

              {/* Protected routes - require login */}
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/submit"    element={<ProtectedRoute><Submit /></ProtectedRoute>} />
              <Route path="/profile"   element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/saved"     element={<ProtectedRoute><SavedListings /></ProtectedRoute>} />
              <Route path="/office-manage" element={<ProtectedRoute><OfficeManage /></ProtectedRoute>} />

              {/* Admin */}
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/seo" element={<SeoCheck />} />

              {/* Legal */}
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/refund" element={<Refund />} />
              <Route path="/accessibility" element={<Accessibility />} />
              <Route path="/mortgage-calculator" element={<MortgageCalculator />} />
              <Route path="/compare" element={<CityCompare />} />
              <Route path="/neighborhoods/:city" element={<NeighborhoodsCity />} />
              <Route path="/insights"        element={<ProtectedRoute><NeighborhoodInsights /></ProtectedRoute>} />
              <Route path="/insights/:city"  element={<ProtectedRoute><NeighborhoodInsights /></ProtectedRoute>} />
              <Route path="/market"          element={<ProtectedRoute><NeighborhoodInsights /></ProtectedRoute>} />
              <Route path="/market/:city"    element={<ProtectedRoute><NeighborhoodInsights /></ProtectedRoute>} />
              <Route path="/city/:cityName" element={<CityLanding />} />

              {/* Programmatic SEO landing pages - unique title/meta per
                  (deal, city, rooms) combination → hundreds of long-tail
                  Google entry points.  See public/sitemap.xml. */}
              <Route path="/rent/in/:city"             element={<SeoLanding deal="rent" />} />
              <Route path="/rent/in/:city/:rooms"      element={<SeoLanding deal="rent" />} />
              <Route path="/sale/in/:city"             element={<SeoLanding deal="forsale" />} />
              <Route path="/sale/in/:city/:rooms"      element={<SeoLanding deal="forsale" />} />

              {/* Public agent profile page */}
              <Route path="/agent/:agentId" element={<AgentProfile />} />

              {/* Blog - weekly market reports + ad-hoc articles */}
              <Route path="/blog"           element={<Blog />} />
              <Route path="/blog/:slug"     element={<BlogPost />} />

              {/* Guides - long-form educational SEO content */}
              <Route path="/guides"         element={<Guides />} />
              <Route path="/guides/:slug"   element={<Guide />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/help" element={<Help />} />

              {/* 404 catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="bg-brand-blue text-white py-5 text-sm">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 opacity-90">
              <BkMonogram variant="brand" className="h-7 w-7" />
              <span className="opacity-80">© 2026 BebKey · bebkey.com</span>
            </div>
            <div className="flex items-center gap-3 opacity-80">
              <a href="https://www.facebook.com/profile.php?id=61591911783347" target="_blank" rel="noopener noreferrer" aria-label="BebKey on Facebook" className="hover:opacity-100 transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 4.99 3.65 9.13 8.44 9.88v-6.99H7.9v-2.89h2.54V9.85c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.77l-.44 2.89h-2.33V22c4.79-.75 8.44-4.89 8.44-9.94Z"/></svg>
              </a>
              <a href="https://www.instagram.com/bebkey_official/" target="_blank" rel="noopener noreferrer" aria-label="BebKey on Instagram" className="hover:opacity-100 transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.34 4.14.63c-.79.31-1.46.71-2.13 1.38S.94 3.35.63 4.14C.34 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.27 2.15.56 2.91.31.79.71 1.46 1.38 2.13.67.67 1.34 1.07 2.13 1.38.76.29 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.27 2.91-.56.79-.31 1.46-.71 2.13-1.38.67-.67 1.07-1.34 1.38-2.13.29-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.27-2.15-.56-2.91-.31-.79-.71-1.46-1.38-2.13C21.32 1.34 20.65.94 19.86.63 19.1.34 18.22.13 16.95.07 15.67.01 15.26 0 12 0Zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84Zm0 10.16A4 4 0 1 1 16 12a4 4 0 0 1-4 4Zm6.41-11.85a1.44 1.44 0 1 0 1.44 1.44 1.44 1.44 0 0 0-1.44-1.44Z"/></svg>
              </a>
              <a href="https://www.tiktok.com/@bebkey_official" target="_blank" rel="noopener noreferrer" aria-label="BebKey on TikTok" className="hover:opacity-100 transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.94a8.16 8.16 0 0 0 4.77 1.52V7A4.85 4.85 0 0 1 19.59 6.69Z"/></svg>
              </a>
              <a href="https://x.com/bebkey_official" target="_blank" rel="noopener noreferrer" aria-label="BebKey on X" className="hover:opacity-100 transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z"/></svg>
              </a>
            </div>
            <div className="flex gap-4 text-xs opacity-70">
              <Link to="/terms" className="hover:opacity-100 hover:underline transition">{t('common.terms')}</Link>
              <Link to="/privacy" className="hover:opacity-100 hover:underline transition">{t('common.privacy')}</Link>
              <Link to="/refund" className="hover:opacity-100 hover:underline transition">{t('common.refunds')}</Link>
              <Link to="/accessibility" className="hover:opacity-100 hover:underline transition">{t('a11y.footerLink')}</Link>
              <Link to="/contact" className="hover:opacity-100 hover:underline transition">{t('common.contact')}</Link>
              <button
                type="button"
                onClick={openCookiePreferences}
                className="hover:opacity-100 hover:underline transition text-left"
              >
                {t('common.cookiePrefs') || 'Cookie preferences'}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}

/** Renders Vercel Analytics + Speed Insights ONLY when the user has
 *  opted in via the cookie banner.  Israeli PPA + EU GDPR require analytics
 *  consent even though Vercel's implementation is cookieless - it still
 *  uses localStorage for visitor IDs, which counts as tracking. */
function ConsentedAnalytics() {
  const consent = useCookieConsent()
  if (!consent.analytics) return null
  return (
    <>
      <Analytics />
      <SpeedInsights />
      <GoogleAnalytics />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
      <ConsentedAnalytics />
    </BrowserRouter>
  )
}

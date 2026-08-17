// supabase/functions/send-email/index.ts
// Deploy: supabase functions deploy send-email
// Set secret: supabase secrets set RESEND_API_KEY=re_xxxx
//
// Supports event types:
//   match_alert         - new listing matched an agent's client
//   welcome             - new user registered
//   inquiry             - buyer submitted an inquiry on a listing
//   saved_search_alert  - new listing matches a buyer's saved search filter

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = 'BebKey <support@bebkey.com>'
const BASE_URL = 'https://www.bebkey.com'

// ─── helper ───────────────────────────────────────────────────────────────────
async function send(to: string, subject: string, html: string) {
  if (!RESEND_KEY) {
    console.warn('RESEND_API_KEY not set - email skipped')
    return { skipped: true }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
  return res.json()
}

function wrap(body: string, opts?: { preheader?: string }) {
  const pre = opts?.preheader ?? ''
  return `
<!DOCTYPE html><html><head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
  <meta name="supported-color-schemes" content="light"/>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f4ff;margin:0;padding:24px 12px;color:#111827;-webkit-font-smoothing:antialiased">
  ${pre ? `<div style="display:none;font-size:1px;color:#f0f4ff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${pre}</div>` : ''}
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(26,86,219,.08)">
    <div style="background:linear-gradient(135deg,#1A56DB 0%,#1e40af 100%);padding:18px 28px">
      <span style="color:#fff;font-size:1.3rem;font-weight:800;letter-spacing:-.5px">Beb</span><span style="color:#F97316;font-size:1.3rem;font-weight:800;letter-spacing:-.5px">Key</span>
    </div>
    <div style="padding:28px 24px">${body}</div>
    <div style="padding:14px 28px;border-top:1px solid #f0f4ff;font-size:.7rem;color:#9ca3af;text-align:center">
      BebKey · <a href="${BASE_URL}" style="color:#1A56DB;text-decoration:none">bebkey.com</a> ·
      <a href="mailto:support@bebkey.com" style="color:#1A56DB;text-decoration:none">support@bebkey.com</a>
    </div>
  </div>
</body></html>`
}

// ─── templates ────────────────────────────────────────────────────────────────
function matchAlertHtml(d: {
  agentName: string
  clientName: string
  listingCity: string
  listingPrice: number | null
  listingRooms: number | null
  listingSize: number | null
  listingId: string
}) {
  const priceStr = d.listingPrice ? `₪${d.listingPrice.toLocaleString('he-IL')}` : ''
  const details = [
    d.listingRooms ? `${d.listingRooms} rooms` : null,
    d.listingSize ? `${d.listingSize} m²` : null,
    d.listingCity,
    priceStr,
  ].filter(Boolean).join(' · ')

  return wrap(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:1.1rem">New match for ${d.clientName} 🏠</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:.9rem">Hi ${d.agentName}, a new listing matches your client's criteria.</p>
    <div style="background:#f0f4ff;border-radius:12px;padding:16px;margin-bottom:20px">
      <p style="margin:0;font-weight:600;color:#111827">${details || 'New listing'}</p>
    </div>
    <a href="${BASE_URL}/listing/${d.listingId}"
       style="display:inline-block;background:#1A56DB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:.9rem">
      View listing →
    </a>
    <p style="margin-top:20px;font-size:.8rem;color:#9ca3af">
      You're receiving this because you added ${d.clientName} as a client on BebKey.
      <a href="${BASE_URL}/dashboard" style="color:#1A56DB">Manage clients</a>
    </p>`)
}

// Per-language welcome-email copy.  Hebrew is the primary audience for
// BebKey but ~30% of users self-select EN/RU/AR/FR.  Keep keys identical
// across languages so the template structure can iterate without
// touching each translation independently.
type WelcomeLang = 'he' | 'en' | 'ru' | 'ar' | 'fr'

interface WelcomeCopy {
  preheader:        string                                              // inbox preview (uses {greeting})
  eyebrow:          string                                              // small uppercase line above the H2
  helloEmoji:       string                                              // "Hi Doron 👋"
  intro:            string                                              // "Your account ${email} is ready..."
  agentSteps:       { title: string; copy: string; cta: string }[]      // 3 steps
  buyerSteps:       { title: string; copy: string; cta: string }[]
  agentTierFooter:  string                                              // HTML with <a> tags
  buyerTierFooter:  string
  agentCta:         string                                              // big final button
  buyerCta:         string
  closing:          string                                              // "Questions? Reply to this email..."
}

const WELCOME_COPY: Record<WelcomeLang, WelcomeCopy> = {
  he: {
    preheader:    'איך להפיק את המקסימום מ-BebKey ב-5 הדקות הראשונות',
    eyebrow:      'ברוכים הבאים ל-BebKey',
    helloEmoji:   '\u{1f44b}',
    intro:        'החשבון שלך <strong style="color:#111827">${email}</strong> מוכן. הנה בדיוק מה לעשות עכשיו:',
    agentSteps: [
      { title: 'פרסמו את המודעה הראשונה',  copy: 'מסלול חינם כולל 5 מודעות פעילות. הוסיפו תמונות, קבעו מחיר, ואתם באוויר תוך 2 דקות.', cta: 'פרסום מודעה →' },
      { title: 'הגדירו פרופיל מתווך',       copy: 'לקוחות רואים את השם שלכם, הטלפון, וכל המודעות שלכם בעמוד אחד ממותג.',                        cta: 'הגדירו פרופיל →' },
      { title: 'שמרו חיפושים ללקוחות',       copy: 'תקבלו אימייל ברגע שמופיע נכס שתואם לקריטריונים של הלקוח.',                                   cta: 'נסו חיפוש →' },
    ],
    buyerSteps: [
      { title: 'חפשו 21,000+ מודעות',       copy: 'יד2, OnMap, Madlan, Janglo, ערוצי Telegram - הכל במקום אחד. כתבו בשפה חופשית: "דירת 3 חדרים ליד החוף בתל אביב עד 8000".', cta: 'התחילו חיפוש →' },
      { title: 'שמרו מודעות וחיפושים',       copy: 'לחצו על הלב לשמור מודעה. שמרו חיפוש - תקבלו אימייל כשמופיעות התאמות חדשות.',                  cta: 'מודעות שמורות →' },
      { title: 'מחשבון משכנתא',              copy: 'כללי הבנקאות הישראלית מובנים: LTV, ריבית עולים, מס רכישה. ראו מה התשלום החודשי האמיתי לפני שאתם מתאהבים בנכס.', cta: 'חשבו עכשיו →' },
    ],
    agentTierFooter: 'אתם במסלול <strong>חינם</strong> (מודעה פעילה אחת, חשיפה של 30 יום). שדרגו ל-<a href="${BASE_URL}/pricing" style="color:#1A56DB;text-decoration:none;font-weight:600">מתחילים ב-₪100/חודש</a> ל-10 מודעות + פאנל מתווך, או <a href="${BASE_URL}/pricing" style="color:#1A56DB;text-decoration:none;font-weight:600">מקצועי ב-₪200/חודש</a> ל-30 מודעות + התראות עדיפות.',
    buyerTierFooter: 'BebKey חינם לשימוש - תשלמו רק אם תהפכו למתווכים שמפרסמים נכסים.',
    agentCta:        'לפאנל הניהול →',
    buyerCta:        'התחילו לחקור →',
    closing:         'שאלה? פשוט השיבו לאימייל הזה או כתבו ל-<a href="mailto:support@bebkey.com" style="color:#9ca3af;text-decoration:underline">support@bebkey.com</a>. אנחנו צוות קטן וקוראים כל הודעה.',
  },
  en: {
    preheader:    'How to get the most out of BebKey in your first 5 minutes',
    eyebrow:      'Welcome to BebKey',
    helloEmoji:   '\u{1f44b}',
    intro:        'Your account <strong style="color:#111827">${email}</strong> is ready. Here’s exactly what to do next:',
    agentSteps: [
      { title: 'Post your first listing',     copy: 'Free tier includes 5 active listings. Add photos, set the price, you’re live in 2 minutes.',         cta: 'Post a listing →' },
      { title: 'Connect your agent profile',  copy: 'Buyers see your name, phone, and active inventory in one branded page.',                                  cta: 'Set up profile →' },
      { title: 'Save your buyer searches',    copy: 'Get an email the moment a property matching your client’s criteria hits the site.',                       cta: 'Try a search →' },
    ],
    buyerSteps: [
      { title: 'Search 21,000+ listings',     copy: 'Yad2, OnMap, Madlan, Janglo, Telegram channels - all aggregated in one place. Type in plain language: "3-bedroom near Tel Aviv beach under 8000".', cta: 'Start searching →' },
      { title: 'Save listings + searches',    copy: 'Heart any listing to save it. Save a search and we’ll email you when new matches appear.',  cta: 'See saved →' },
      { title: 'Use the mortgage calculator', copy: 'Israeli rules built in: LTV caps, olim rates, mas rechisha. See your real monthly payment before you fall in love with a place.', cta: 'Calculate →' },
    ],
    agentTierFooter: 'You’re on the <strong>Free tier</strong> (1 active listing, 30-day visibility). Upgrade to <a href="${BASE_URL}/pricing" style="color:#1A56DB;text-decoration:none;font-weight:600">Starter ₪100/mo</a> for 10 listings + agent dashboard, or <a href="${BASE_URL}/pricing" style="color:#1A56DB;text-decoration:none;font-weight:600">Pro ₪200/mo</a> for 30 listings + priority alerts.',
    buyerTierFooter: 'BebKey is free to browse — you only ever pay if you become an agent listing properties.',
    agentCta:        'Go to your dashboard →',
    buyerCta:        'Start exploring →',
    closing:         'Questions? Just reply to this email or write to <a href="mailto:support@bebkey.com" style="color:#9ca3af;text-decoration:underline">support@bebkey.com</a>. We’re a small team and we read every message.',
  },
  ru: {
    preheader:    'Как получить максимум от BebKey за первые 5 минут',
    eyebrow:      'Добро пожаловать в BebKey',
    helloEmoji:   '\u{1f44b}',
    intro:        'Ваш аккаунт <strong style="color:#111827">${email}</strong> готов. Вот что делать дальше:',
    agentSteps: [
      { title: 'Опубликуйте первое объявление', copy: 'Бесплатный тариф - 5 активных объявлений. Добавьте фото, укажите цену - всё за 2 минуты.', cta: 'Создать объявление →' },
      { title: 'Настройте профиль агента',       copy: 'Покупатели видят ваше имя, телефон и активный инвентарь на одной странице.',                  cta: 'Заполнить профиль →' },
      { title: 'Сохраняйте поиски клиентов',     copy: 'Получите письмо в момент появления объекта, подходящего вашему клиенту.',                      cta: 'Попробовать поиск →' },
    ],
    buyerSteps: [
      { title: 'Ищите среди 21 000+ объявлений', copy: 'Yad2, OnMap, Madlan, Janglo, Telegram - всё в одном месте. Пишите простым языком: «3-комнатная у пляжа Тель-Авива до 8000».', cta: 'Начать поиск →' },
      { title: 'Сохраняйте объявления и поиски', copy: 'Кликните на сердечко чтобы сохранить. Сохраните поиск - и мы пришлём письмо при новых совпадениях.',                          cta: 'Сохранённое →' },
      { title: 'Используйте ипотечный калькулятор', copy: 'Израильские правила встроены: лимиты LTV, ставки для репатриантов, мас рехиша. Узнайте реальный платёж до того, как влюбитесь в квартиру.', cta: 'Рассчитать →' },
    ],
    agentTierFooter: 'Вы на <strong>бесплатном тарифе</strong> (1 активное объявление, 30 дней видимости). Перейдите на <a href="${BASE_URL}/pricing" style="color:#1A56DB;text-decoration:none;font-weight:600">Старт ₪100/мес</a> для 10 объявлений + кабинета агента, или <a href="${BASE_URL}/pricing" style="color:#1A56DB;text-decoration:none;font-weight:600">Про ₪200/мес</a> для 30 объявлений + приоритетных уведомлений.',
    buyerTierFooter: 'BebKey бесплатен для покупателей - вы платите только если становитесь агентом, размещающим объекты.',
    agentCta:        'В кабинет →',
    buyerCta:        'Начать →',
    closing:         'Вопросы? Просто ответьте на это письмо или напишите на <a href="mailto:support@bebkey.com" style="color:#9ca3af;text-decoration:underline">support@bebkey.com</a>. Мы небольшая команда и читаем каждое сообщение.',
  },
  ar: {
    preheader:    'كيف تستفيد إلى أقصى حد من BebKey في أول 5 دقائق',
    eyebrow:      'مرحبا بك في BebKey',
    helloEmoji:   '\u{1f44b}',
    intro:        'حسابك <strong style="color:#111827">${email}</strong> جاهز. إليك ما يجب فعله الآن:',
    agentSteps: [
      { title: 'انشر أول إعلان لك',          copy: 'الباقة المجانية تشمل 5 إعلانات نشطة. أضف الصور، حدد السعر، وستكون نشطا خلال دقيقتين.', cta: 'انشر إعلانا →' },
      { title: 'أعدّ ملف وكيلك',              copy: 'يرى المشترون اسمك ورقم هاتفك ومخزونك النشط في صفحة واحدة بهوية بصرية.',              cta: 'إعداد الملف →' },
      { title: 'احفظ عمليات بحث العملاء',     copy: 'تلقى بريدا إلكترونيا فور ظهور عقار يطابق معايير عميلك.',                              cta: 'جرب البحث →' },
    ],
    buyerSteps: [
      { title: 'ابحث في 21,000+ إعلان',       copy: 'Yad2 و OnMap و Madlan و Janglo و قنوات Telegram - كلها مجمعة في مكان واحد. اكتب بلغة عادية: «شقة 3 غرف قرب شاطئ تل أبيب تحت 8000».', cta: 'ابدأ البحث →' },
      { title: 'احفظ الإعلانات والبحوث',       copy: 'اضغط على القلب لحفظ أي إعلان. احفظ البحث وسنبعث بريدا عند ظهور تطابقات جديدة.',                                                       cta: 'المحفوظة →' },
      { title: 'استخدم حاسبة الرهن',           copy: 'القواعد الإسرائيلية مدمجة: حدود LTV، أسعار المهاجرين، ضريبة الشراء. اعرف القسط الشهري الحقيقي قبل أن تقع في حب العقار.', cta: 'احسب →' },
    ],
    agentTierFooter: 'أنت على <strong>الباقة المجانية</strong> (إعلان نشط واحد، ظهور 30 يوما). ارقَ إلى <a href="${BASE_URL}/pricing" style="color:#1A56DB;text-decoration:none;font-weight:600">المبتدئ ₪100/شهر</a> لـ 10 إعلانات + لوحة وكيل، أو <a href="${BASE_URL}/pricing" style="color:#1A56DB;text-decoration:none;font-weight:600">الاحترافي ₪200/شهر</a> لـ 30 إعلانا + تنبيهات أولوية.',
    buyerTierFooter: 'BebKey مجاني للتصفح - تدفع فقط إذا أصبحت وكيلا ينشر العقارات.',
    agentCta:        'إلى اللوحة →',
    buyerCta:        'ابدأ الاستكشاف →',
    closing:         'لديك سؤال؟ رد على هذا البريد أو اكتب إلى <a href="mailto:support@bebkey.com" style="color:#9ca3af;text-decoration:underline">support@bebkey.com</a>. نحن فريق صغير ونقرأ كل رسالة.',
  },
  fr: {
    preheader:    'Comment tirer le meilleur de BebKey dans vos 5 premières minutes',
    eyebrow:      'Bienvenue sur BebKey',
    helloEmoji:   '\u{1f44b}',
    intro:        'Votre compte <strong style="color:#111827">${email}</strong> est prêt. Voici exactement quoi faire ensuite :',
    agentSteps: [
      { title: 'Publiez votre première annonce', copy: 'Le forfait gratuit inclut 5 annonces actives. Ajoutez des photos, fixez le prix, vous êtes en ligne en 2 minutes.', cta: 'Publier une annonce →' },
      { title: 'Connectez votre profil d’agent',  copy: 'Les acheteurs voient votre nom, téléphone et inventaire actif sur une page de marque.',                                cta: 'Configurer le profil →' },
      { title: 'Sauvegardez les recherches clients', copy: 'Recevez un email dès qu’une propriété correspondant aux critères de votre client apparaît.',                            cta: 'Essayer une recherche →' },
    ],
    buyerSteps: [
      { title: 'Cherchez parmi 21 000+ annonces', copy: 'Yad2, OnMap, Madlan, Janglo, canaux Telegram - tout regroupé. Écrivez en langage naturel : «3 pièces près plage Tel Aviv sous 8000».', cta: 'Commencer la recherche →' },
      { title: 'Sauvegardez annonces et recherches', copy: 'Cliquez le cœur pour sauvegarder. Enregistrez une recherche et nous vous écrirons aux nouvelles correspondances.',                  cta: 'Voir favoris →' },
      { title: 'Calculateur de prêt hypothécaire', copy: 'Règles israéliennes intégrées : plafonds LTV, taux olim, mas rechisha. Voyez la vraie mensualité avant de tomber amoureux.', cta: 'Calculer →' },
    ],
    agentTierFooter: 'Vous êtes sur le <strong>forfait gratuit</strong> (1 annonce active, visibilité 30 jours). Passez à <a href="${BASE_URL}/pricing" style="color:#1A56DB;text-decoration:none;font-weight:600">Démarrage ₪100/mois</a> pour 10 annonces + tableau de bord agent, ou <a href="${BASE_URL}/pricing" style="color:#1A56DB;text-decoration:none;font-weight:600">Pro ₪200/mois</a> pour 30 annonces + alertes prioritaires.',
    buyerTierFooter: 'BebKey est gratuit pour la navigation - vous ne payez que si vous devenez agent publiant des biens.',
    agentCta:        'Vers le tableau de bord →',
    buyerCta:        'Commencer →',
    closing:         'Une question ? Répondez simplement à cet email ou écrivez à <a href="mailto:support@bebkey.com" style="color:#9ca3af;text-decoration:underline">support@bebkey.com</a>. Nous sommes une petite équipe et nous lisons chaque message.',
  },
}

function welcomeHtml(d: { name: string; email: string; role?: string; lang?: string }) {
  const langKey: WelcomeLang = ['he', 'en', 'ru', 'ar', 'fr'].includes((d.lang ?? '').toLowerCase())
    ? ((d.lang ?? '').toLowerCase() as WelcomeLang)
    : 'en'
  const copy = WELCOME_COPY[langKey]
  const isRTL = langKey === 'he' || langKey === 'ar'
  const dirAttr = isRTL ? ' dir="rtl"' : ''
  const isAgent = (d.role ?? '').toLowerCase() === 'agent'
  const greeting = d.name ? `${langKey === 'he' ? 'שלום' : langKey === 'ru' ? 'Привет' : langKey === 'ar' ? 'مرحبا' : langKey === 'fr' ? 'Bonjour' : 'Hi'} ${d.name}` : copy.eyebrow

  const sub = (s: string) => s.replaceAll('${BASE_URL}', BASE_URL).replaceAll('${email}', d.email)

  // Soft activation: walk the user through what they can do RIGHT NOW
  // Walk the user through what they can do RIGHT NOW (free tier) and
  // what each next step gets them.  Different ordering for agents vs
  // buyers based on their declared role at signup, in their language.
  const steps = (isAgent ? copy.agentSteps : copy.buyerSteps).map((s, i) => ({
    ...s,
    num: String(i + 1),
    url: isAgent ? ['/submit', '/dashboard', '/search'][i] : ['/search', '/saved', '/mortgage-calculator'][i],
  }))

  const stepCards = steps.map(s => `
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fff;border:1px solid #e5e9f3;border-radius:14px;margin-bottom:12px"${dirAttr}>
      <tr>
        <td style="width:46px;text-align:center;vertical-align:top;padding:18px 0 18px 16px">
          <div style="width:36px;height:36px;background:linear-gradient(135deg,#1A56DB 0%,#1e40af 100%);color:#fff;border-radius:50%;display:inline-block;line-height:36px;text-align:center;font-weight:800;font-size:14px">${s.num}</div>
        </td>
        <td style="padding:16px 18px 16px 12px">
          <p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:1.02rem">${s.title}</p>
          <p style="margin:0 0 10px;color:#6b7280;font-size:.85rem;line-height:1.5">${s.copy}</p>
          <a href="${BASE_URL}${s.url}" style="display:inline-block;color:#1A56DB;text-decoration:none;font-size:.85rem;font-weight:700">${s.cta}</a>
        </td>
      </tr>
    </table>`).join('')

  const tierHint = `<p style="margin:6px 0 0;font-size:.8rem;color:#6b7280">${sub(isAgent ? copy.agentTierFooter : copy.buyerTierFooter)}</p>`

  return wrap(`
    <div${dirAttr}>
    <p style="margin:0 0 6px;font-size:.78rem;color:#6b7280;text-transform:uppercase;letter-spacing:1px;font-weight:600">${copy.eyebrow}</p>
    <h2 style="margin:0 0 8px;color:#111827;font-size:1.45rem;font-weight:800;letter-spacing:-.3px">${greeting} ${copy.helloEmoji}</h2>
    <p style="margin:0 0 22px;color:#6b7280;font-size:.95rem;line-height:1.5">
      ${sub(copy.intro)}
    </p>
    ${stepCards}
    <div style="margin-top:18px;padding:14px 16px;background:#f0f4ff;border-radius:12px">
      ${tierHint}
    </div>
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:18px">
      <tr><td align="center">
        <a href="${BASE_URL}${isAgent ? '/dashboard' : '/search'}" style="display:inline-block;background:#1A56DB;color:#fff;text-decoration:none;padding:13px 28px;border-radius:11px;font-weight:700;font-size:.95rem">
          ${isAgent ? copy.agentCta : copy.buyerCta}
        </a>
      </td></tr>
    </table>
    <p style="margin:22px 0 0;font-size:.78rem;color:#9ca3af;text-align:center;line-height:1.5">
      ${sub(copy.closing)}
    </p>
    </div>`, { preheader: `${greeting} — ${copy.preheader}` })
}

function inquiryHtml(d: {
  agentEmail: string
  agentName: string
  buyerName: string
  buyerPhone: string
  buyerMessage: string
  listingCity: string
  listingPrice: number | null
  listingId: string
}) {
  const priceStr = d.listingPrice ? `₪${d.listingPrice.toLocaleString('he-IL')}` : ''
  return wrap(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:1.1rem">New inquiry on your listing 📩</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:.9rem">
      Hi ${d.agentName}, a buyer is interested in your listing in <strong>${d.listingCity}</strong>${priceStr ? ` (${priceStr})` : ''}.
    </p>
    <div style="background:#f0f4ff;border-radius:12px;padding:16px;margin-bottom:20px">
      <p style="margin:0 0 6px;font-weight:600;color:#111827">${d.buyerName}</p>
      <p style="margin:0 0 6px;color:#374151;font-size:.9rem">📞 <a href="tel:${d.buyerPhone}" style="color:#1A56DB">${d.buyerPhone}</a></p>
      ${d.buyerMessage ? `<p style="margin:8px 0 0;color:#374151;font-size:.9rem;font-style:italic">"${d.buyerMessage}"</p>` : ''}
    </div>
    <a href="${BASE_URL}/listing/${d.listingId}"
       style="display:inline-block;background:#1A56DB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:.9rem">
      View listing →
    </a>`)
}

// ─── saved search alert (buyer gets email when new listing matches their filter) ─
// Visual redesign: large hero image with overlay price chip, deal-type badge,
// neighborhood line with pin emoji, separate stats row, prominent CTA.
// The first listing is rendered as a hero card; subsequent ones as compact
// horizontal thumbnail cards. Mobile-tested.
function savedSearchAlertHtml(d: {
  searchName: string
  matchCount: number
  listings: Array<{
    id:           string
    city:         string
    neighborhood?: string
    price:        number | null
    rooms:        number | null
    size_m2?:     number | null
    dealType:     string
    sourceUrl:    string
    image:        string
    aiSummary?:   string | null
  }>
}) {
  const formatPrice = (p: number | null, isRent: boolean): string => {
    if (!p) return 'Price on request'
    if (p >= 1_000_000) return `₪${(p / 1_000_000).toFixed(p % 1_000_000 === 0 ? 0 : 2)}M${isRent ? '/mo' : ''}`
    if (p >= 1_000)     return `₪${Math.round(p / 1_000)}K${isRent ? '/mo' : ''}`
    return `₪${p.toLocaleString('he-IL')}${isRent ? '/mo' : ''}`
  }

  // ── Hero card (first listing) - large image + overlay ──
  const heroCard = (l: typeof d.listings[0]) => {
    const isRent = l.dealType === 'rent'
    const priceTxt = formatPrice(l.price, isRent)
    const dealBadge = isRent
      ? `<span style="display:inline-block;background:#F97316;color:#fff;padding:3px 10px;border-radius:999px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px">For rent</span>`
      : `<span style="display:inline-block;background:#1A56DB;color:#fff;padding:3px 10px;border-radius:999px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px">For sale</span>`
    const loc = [l.neighborhood, l.city].filter(Boolean).join(' · ') || 'Israel'
    const stats = [
      l.rooms != null   ? `<strong style="color:#111827">${l.rooms}</strong> rooms` : null,
      l.size_m2 != null ? `<strong style="color:#111827">${l.size_m2}</strong> m²`  : null,
    ].filter(Boolean).join('  ·  ')

    return `
      <div style="background:#fff;border:1px solid #e5e9f3;border-radius:14px;overflow:hidden;margin-bottom:18px;box-shadow:0 2px 6px rgba(26,86,219,.04)">
        ${l.image ? `
        <div style="position:relative;line-height:0">
          <img src="${l.image}" alt="" style="width:100%;height:220px;object-fit:cover;display:block" referrerpolicy="no-referrer"/>
        </div>` : `
        <div style="height:60px;background:linear-gradient(135deg,#1A56DB 0%,#1e40af 100%)"></div>`}
        <div style="padding:18px 18px 16px">
          <div style="margin-bottom:8px">${dealBadge}</div>
          <p style="margin:0 0 4px;font-weight:800;color:#111827;font-size:1.4rem;letter-spacing:-.5px">${priceTxt}</p>
          <p style="margin:0 0 10px;color:#374151;font-size:.95rem;font-weight:600">📍 ${loc}</p>
          ${stats ? `<p style="margin:0 0 ${l.aiSummary ? 10 : 14}px;color:#6b7280;font-size:.85rem">${stats}</p>` : ''}
          ${l.aiSummary ? `<p style="margin:0 0 14px;padding:10px 12px;background:#eff6ff;border-left:3px solid #1A56DB;border-radius:6px;font-size:.85rem;color:#1e3a8a;line-height:1.4">✨ ${l.aiSummary}</p>` : ''}
          <table cellpadding="0" cellspacing="0" border="0" style="margin-top:4px">
            <tr><td>
              <a href="${BASE_URL}/listing/${l.id}" style="display:inline-block;background:#1A56DB;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:700;font-size:.88rem">
                View listing →
              </a>
            </td>${l.sourceUrl ? `<td style="padding-inline-start:6px">
              <a href="${BASE_URL}/api/source-redirect?id=${l.id}" style="display:inline-block;color:#1A56DB;text-decoration:none;padding:11px 14px;font-size:.83rem;font-weight:600">
                Source ↗
              </a>
            </td>` : ''}</tr>
          </table>
        </div>
      </div>`
  }

  // ── Compact card (subsequent listings) - thumbnail left, details right ──
  const compactCard = (l: typeof d.listings[0]) => {
    const isRent = l.dealType === 'rent'
    const priceTxt = formatPrice(l.price, isRent)
    const loc = [l.neighborhood, l.city].filter(Boolean).join(' · ') || 'Israel'
    const stats = [
      l.rooms != null   ? `${l.rooms} rm`  : null,
      l.size_m2 != null ? `${l.size_m2} m²` : null,
    ].filter(Boolean).join(' · ')
    const dealColor = isRent ? '#F97316' : '#1A56DB'

    return `
      <a href="${BASE_URL}/listing/${l.id}" style="text-decoration:none;color:inherit;display:block">
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fff;border:1px solid #e5e9f3;border-radius:12px;margin-bottom:10px;overflow:hidden">
          <tr>
            ${l.image ? `<td style="width:110px;vertical-align:top;line-height:0">
              <img src="${l.image}" alt="" style="width:110px;height:100px;object-fit:cover;display:block" referrerpolicy="no-referrer"/>
            </td>` : `<td style="width:110px;background:linear-gradient(135deg,${dealColor} 0%,#1e40af 100%)"></td>`}
            <td style="padding:12px 14px;vertical-align:top">
              <p style="margin:0 0 3px;font-weight:700;color:${dealColor};font-size:1.02rem">${priceTxt}</p>
              <p style="margin:0 0 4px;color:#111827;font-size:.85rem;font-weight:600">${loc}</p>
              <p style="margin:0;color:#6b7280;font-size:.78rem">${stats}</p>
            </td>
          </tr>
        </table>
      </a>`
  }

  const hero  = d.listings[0] ? heroCard(d.listings[0]) : ''
  const rest  = d.listings.slice(1).map(compactCard).join('')

  const headline = d.matchCount === 1
    ? `1 new listing matches your search`
    : `${d.matchCount} new listings match your search`

  // Pre-header text (shows in inbox preview after subject line)
  const firstCity = d.listings[0]?.city || 'Israel'
  const firstPrice = d.listings[0]?.price ? formatPrice(d.listings[0].price, d.listings[0].dealType === 'rent') : ''
  const preheader = `${headline} - latest: ${firstPrice} in ${firstCity}`

  // "View all" link to /search with the saved filter encoded (rough — name is best we have)
  const viewAllUrl = `${BASE_URL}/dashboard`

  return wrap(`
    <p style="margin:0 0 6px;font-size:.78rem;color:#6b7280;text-transform:uppercase;letter-spacing:1px;font-weight:600">Saved search · ${d.searchName}</p>
    <h2 style="margin:0 0 6px;color:#111827;font-size:1.35rem;font-weight:800;letter-spacing:-.3px">${headline}</h2>
    <p style="margin:0 0 22px;color:#6b7280;font-size:.92rem;line-height:1.5">
      Here ${d.listings.length === 1 ? 'is the latest match' : `are the latest ${d.listings.length} matches`} from your saved search.
      ${d.matchCount > d.listings.length ? `<a href="${viewAllUrl}" style="color:#1A56DB;text-decoration:none;font-weight:600">See all ${d.matchCount} →</a>` : ''}
    </p>
    ${hero}
    ${rest ? `<p style="margin:18px 0 10px;font-size:.78rem;color:#6b7280;text-transform:uppercase;letter-spacing:.8px;font-weight:600">More matches</p>${rest}` : ''}
    <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:20px">
      <tr><td align="center">
        <a href="${viewAllUrl}" style="display:inline-block;color:#1A56DB;text-decoration:none;font-weight:600;font-size:.88rem;padding:8px 18px;border:1.5px solid #1A56DB;border-radius:10px">
          Manage saved searches
        </a>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:.72rem;color:#9ca3af;text-align:center;line-height:1.5">
      You're receiving this because you saved a search on BebKey.<br/>
      <a href="${BASE_URL}/dashboard" style="color:#9ca3af;text-decoration:underline">Unsubscribe or change frequency</a>
    </p>`, { preheader })
}

// ─── confirmation email to buyer after inquiry ────────────────────────────────
function inquiryConfirmHtml(d: { buyerName: string; listingCity: string; listingId: string }) {
  return wrap(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:1.1rem">We've sent your inquiry! ✅</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:.9rem">
      Hi ${d.buyerName || 'there'}, the agent for the listing in <strong>${d.listingCity}</strong> has been notified and will be in touch soon.
    </p>
    <a href="${BASE_URL}/listing/${d.listingId}"
       style="display:inline-block;background:#1A56DB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:.9rem">
      View listing →
    </a>
    <p style="margin-top:20px;font-size:.8rem;color:#9ca3af">
      Browse more listings at <a href="${BASE_URL}/search" style="color:#1A56DB">bebkey.com</a>
    </p>`)
}

// ─── main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  // CORS for local dev
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 })
  }

  const { type, data } = body as { type: string; data: Record<string, unknown> }

  try {
    let result: unknown

    if (type === 'match_alert') {
      result = await send(
        data.agentEmail as string,
        `New match for ${data.clientName} on BebKey 🏠`,
        matchAlertHtml(data as Parameters<typeof matchAlertHtml>[0]),
      )
    } else if (type === 'welcome') {
      result = await send(
        data.email as string,
        'Welcome to BebKey 🎉',
        welcomeHtml(data as Parameters<typeof welcomeHtml>[0]),
      )
    } else if (type === 'inquiry') {
      // Email to agent
      result = await send(
        data.agentEmail as string,
        `New inquiry on your ${data.listingCity} listing`,
        inquiryHtml(data as Parameters<typeof inquiryHtml>[0]),
      )
      // Confirmation to buyer (if they provided an email)
      if (data.buyerEmail) {
        await send(
          data.buyerEmail as string,
          'Your inquiry has been sent - BebKey',
          inquiryConfirmHtml(data as Parameters<typeof inquiryConfirmHtml>[0]),
        )
      }
    } else if (type === 'saved_search_alert') {
      // send_alerts.py sends { email, searchName, matchCount, listings: [{...}] }
      const sd = data as {
        email: string
        searchName: string
        matchCount: number
        listings: Parameters<typeof savedSearchAlertHtml>[0]['listings']
      }
      const firstCity = sd.listings?.[0]?.city || 'Israel'
      result = await send(
        sd.email,
        sd.matchCount === 1
          ? `New listing in ${firstCity} matches your search - BebKey 🏠`
          : `${sd.matchCount} new ${firstCity} listings match your saved search - BebKey 🏠`,
        savedSearchAlertHtml({
          searchName: sd.searchName,
          matchCount: sd.matchCount,
          listings:   sd.listings || [],
        }),
      )
    } else {
      return new Response(JSON.stringify({ error: `unknown type: ${type}` }), { status: 400 })
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-email error', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})

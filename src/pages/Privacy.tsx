import { useTranslation } from 'react-i18next'
import { useSeo } from '../hooks/useSeo'

const EM = () => (
  <a href="mailto:support@bebkey.com" className="text-brand-blue underline">
    support@bebkey.com
  </a>
)
const PPA = ({ label }: { label: string }) => (
  <a
    href="https://www.gov.il/en/departments/the_privacy_protection_authority"
    target="_blank"
    rel="noopener noreferrer"
    className="text-brand-blue underline"
  >
    {label}
  </a>
)

const S = ({
  heading,
  highlight,
  children,
}: {
  heading: string
  highlight?: boolean
  children: React.ReactNode
}) => (
  <section
    className={`mb-6${highlight ? ' border border-blue-100 rounded-xl p-4 bg-blue-50' : ''}`}
  >
    <h2 className="text-lg font-semibold text-gray-800 mb-2">{heading}</h2>
    {children}
  </section>
)

// ── English ──────────────────────────────────────────────────────────────────
function En() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-gray-400 text-xs mb-2">Last updated: July 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        Published in accordance with the <strong>Protection of Privacy Law, 5741-1981</strong> and{' '}
        <strong>Amendment No. 13 (2024)</strong>, in force since August 14, 2025.
      </p>
      <S heading="1. Data Controller">
        <p>BebKey ("we", "us") operates <strong>bebkey.com</strong> and is the data controller for personal information processed through this site.</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>Privacy requests:</strong> <EM /></li>
          <li><strong>Supervisory authority:</strong> <PPA label="Israel Privacy Protection Authority (PPA)" /></li>
        </ul>
      </S>
      <S heading="2. Personal Data We Collect">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">Examples</th>
                <th className="text-left px-3 py-2">Required?</th>
                <th className="text-left px-3 py-2">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr><td className="px-3 py-2 font-medium">Account data</td><td className="px-3 py-2">Email, name, phone, role</td><td className="px-3 py-2">Required</td><td className="px-3 py-2">Authentication &amp; service delivery</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">Agent profile</td><td className="px-3 py-2">Licence number, agency name, photo</td><td className="px-3 py-2">Required for agents</td><td className="px-3 py-2">Public profile display</td></tr>
              <tr><td className="px-3 py-2 font-medium">Listing data</td><td className="px-3 py-2">Property details, photos, price</td><td className="px-3 py-2">Required to post</td><td className="px-3 py-2">Publishing listings</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">Client data</td><td className="px-3 py-2">Contacts uploaded to dashboard</td><td className="px-3 py-2">Voluntary</td><td className="px-3 py-2">Agent-client matching</td></tr>
              <tr><td className="px-3 py-2 font-medium">Usage data</td><td className="px-3 py-2">Pages, searches, filters</td><td className="px-3 py-2">Automatic (essential)</td><td className="px-3 py-2">Platform operation &amp; security</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">Payment data</td><td className="px-3 py-2">Billing history, plan type</td><td className="px-3 py-2">Required for paid plans</td><td className="px-3 py-2">Processed by Lemon Squeezy — we never see card details</td></tr>
              <tr><td className="px-3 py-2 font-medium">Technical data</td><td className="px-3 py-2">IP, browser, session token</td><td className="px-3 py-2">Automatic (essential)</td><td className="px-3 py-2">Security &amp; fraud prevention</td></tr>
            </tbody>
          </table>
        </div>
      </S>
      <S heading="3. How & Why We Use Your Data">
        <ul className="list-disc list-inside space-y-2 text-gray-600">
          <li>To create and manage your account and verify your identity</li>
          <li>To publish listings and operate client-matching alerts</li>
          <li>To process subscription payments and manage billing</li>
          <li>To send transactional emails (receipts, matches, security notices)</li>
          <li>To detect fraud, abuse, and unauthorised access</li>
          <li>To improve platform performance and fix bugs</li>
          <li>To comply with legal obligations under Israeli law</li>
        </ul>
        <p className="mt-2">We do <strong>not</strong> use your data for behavioural advertising. We do <strong>not</strong> sell your personal data.</p>
      </S>
      <S heading="4. Who Receives Your Data">
        <ul className="list-disc list-inside space-y-2 text-gray-600 mt-2">
          <li><strong>Supabase Inc.</strong> (USA) — database hosting and authentication under a data processing agreement.</li>
          <li><strong>Lemon Squeezy Inc.</strong> (USA) — payment processing; we receive only anonymised billing metadata.</li>
          <li><strong>Israeli authorities</strong> — when required by binding legal order.</li>
        </ul>
      </S>
      <S heading="5. How Long We Keep Your Data">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li><strong>Account data:</strong> active period + 2 years after closure (unless deletion requested)</li>
          <li><strong>Listing data:</strong> while published; archived 1 year after removal</li>
          <li><strong>Billing records:</strong> 7 years (Israeli tax law)</li>
          <li><strong>Security logs:</strong> up to 12 months</li>
          <li><strong>Client data you upload:</strong> deleted within 30 days of account closure</li>
        </ul>
      </S>
      <S heading="6. Your Rights Under Israeli Privacy Law" highlight>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Access</strong> — request a copy of data we hold about you</li>
          <li><strong>Correction</strong> — request correction of inaccurate or incomplete data</li>
          <li><strong>Deletion</strong> — request deletion where there is no legal basis for continued retention</li>
          <li><strong>Object to direct marketing</strong> — opt out at any time</li>
          <li><strong>Withdraw consent</strong> — at any time, without affecting prior processing</li>
          <li><strong>Complaint</strong> — file with the <PPA label="Israel Privacy Protection Authority" /></li>
        </ul>
        <p className="mt-3 text-xs text-gray-600">Email <EM /> to exercise any right. As required under Israeli privacy law, we respond within <strong>30 days</strong>.</p>
      </S>
      <S heading="7. Cookies & Similar Technologies">
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>Essential cookies</strong> — required for login and security; always active.</li>
          <li><strong>Functional cookies</strong> — remember language preference; active with consent.</li>
          <li><strong>Analytics cookies</strong> — Vercel Analytics, Vercel Speed Insights, and Google Analytics 4 (G-0B16BNNH9D); measure aggregate usage to improve the site. Only active with your explicit consent (off by default). Google Analytics 4 uses IP addresses for geographic aggregation; we do not enable advertising features.</li>
        </ul>
        <p className="mt-2">We do not use advertising, profiling, or cross-site behavioural targeting cookies.</p>
      </S>
      <S heading="8. Security">
        <p>We apply TLS encryption, Supabase Row-Level Security, single-session enforcement, and access controls. In the event of a serious incident, we notify the PPA within 72 hours and affected users as required.</p>
      </S>
      <S heading="9. Minors">
        <p>BebKey is not directed at persons under 18. Contact us to remove any data submitted by a minor.</p>
      </S>
      <S heading="10. Changes to This Policy">
        <p>Material changes are notified by email and on-site notice. The "Last updated" date reflects the latest revision.</p>
      </S>
      <S heading="11. Contact">
        <p>Privacy questions: <EM /></p>
        <p className="mt-1">You may also lodge a complaint with the <PPA label="Israel Privacy Protection Authority" />.</p>
      </S>
    </>
  )
}

// ── Hebrew ───────────────────────────────────────────────────────────────────
function He() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">מדיניות פרטיות</h1>
      <p className="text-gray-400 text-xs mb-2">עודכן לאחרונה: יולי 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        מפורסמת בהתאם ל<strong>חוק הגנת הפרטיות, תשמ"א-1981</strong> ו<strong>תיקון מס' 13 (2024)</strong>, שנכנס לתוקף ב-14 באוגוסט 2025.
      </p>
      <S heading="1. בעל מאגר המידע">
        <p>BebKey ("אנחנו") מפעילה את <strong>bebkey.com</strong> והיא בעלת מאגר המידע האחראית על המידע האישי המעובד דרך אתר זה.</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>פניות בנושא פרטיות:</strong> <EM /></li>
          <li><strong>רשות מפקחת:</strong> <PPA label="הרשות להגנת הפרטיות" /></li>
        </ul>
      </S>
      <S heading="2. מידע אישי שאנו אוספים">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="text-right px-3 py-2">סוג</th>
                <th className="text-right px-3 py-2">דוגמאות</th>
                <th className="text-right px-3 py-2">חובה?</th>
                <th className="text-right px-3 py-2">מטרה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr><td className="px-3 py-2 font-medium">נתוני חשבון</td><td className="px-3 py-2">אימייל, שם, טלפון, תפקיד</td><td className="px-3 py-2">חובה</td><td className="px-3 py-2">אימות ומתן שירות</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">פרופיל סוכן</td><td className="px-3 py-2">מספר רישיון, שם משרד, תמונה</td><td className="px-3 py-2">חובה לסוכנים</td><td className="px-3 py-2">הצגת פרופיל ציבורי</td></tr>
              <tr><td className="px-3 py-2 font-medium">נתוני מודעות</td><td className="px-3 py-2">פרטי נכס, תמונות, מחיר</td><td className="px-3 py-2">חובה לפרסום</td><td className="px-3 py-2">פרסום מודעות</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">נתוני לקוחות</td><td className="px-3 py-2">אנשי קשר שהועלו ללוח הבקרה</td><td className="px-3 py-2">רשות</td><td className="px-3 py-2">התאמת לקוחות</td></tr>
              <tr><td className="px-3 py-2 font-medium">נתוני שימוש</td><td className="px-3 py-2">דפים, חיפושים, מסננים</td><td className="px-3 py-2">אוטומטי (חיוני)</td><td className="px-3 py-2">הפעלת הפלטפורמה ואבטחה</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">נתוני תשלום</td><td className="px-3 py-2">היסטוריית חיובים, סוג תוכנית</td><td className="px-3 py-2">חובה לתוכניות בתשלום</td><td className="px-3 py-2">מעובד על-ידי Lemon Squeezy — אנחנו לא רואים פרטי כרטיס</td></tr>
              <tr><td className="px-3 py-2 font-medium">נתונים טכניים</td><td className="px-3 py-2">IP, דפדפן, טוקן סשן</td><td className="px-3 py-2">אוטומטי (חיוני)</td><td className="px-3 py-2">אבטחה ומניעת הונאה</td></tr>
            </tbody>
          </table>
        </div>
      </S>
      <S heading="3. כיצד ולמה אנחנו משתמשים במידע שלכם">
        <ul className="list-disc list-inside space-y-2 text-gray-600">
          <li>יצירה וניהול חשבונכם ואימות זהותכם</li>
          <li>פרסום מודעות ותפעול התראות התאמת לקוחות</li>
          <li>עיבוד תשלומי מנוי וניהול חיובים</li>
          <li>שליחת אימיילים עסקיים (קבלות, התאמות, הודעות אבטחה)</li>
          <li>זיהוי הונאות, ניצול לרעה וגישה בלתי מורשית</li>
          <li>שיפור ביצועי הפלטפורמה ותיקון תקלות</li>
          <li>עמידה בחובות חוקיות על פי דין ישראלי</li>
        </ul>
        <p className="mt-2">אנחנו <strong>לא</strong> משתמשים במידע שלכם לפרסום התנהגותי. אנחנו <strong>לא</strong> מוכרים מידע אישי.</p>
      </S>
      <S heading="4. מי מקבל את המידע שלכם">
        <ul className="list-disc list-inside space-y-2 text-gray-600 mt-2">
          <li><strong>Supabase Inc.</strong> (ארה"ב) — אחסון מסד נתונים ואימות, תחת הסכם עיבוד נתונים.</li>
          <li><strong>Lemon Squeezy Inc.</strong> (ארה"ב) — עיבוד תשלומים; אנחנו מקבלים רק מטה-נתוני חיוב מאונונימיים.</li>
          <li><strong>רשויות ישראליות</strong> — כשנדרש על פי צו משפטי מחייב.</li>
        </ul>
      </S>
      <S heading="5. כמה זמן אנחנו שומרים את המידע שלכם">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li><strong>נתוני חשבון:</strong> תקופת הפעילות + שנתיים לאחר סגירה (אלא אם נדרשה מחיקה)</li>
          <li><strong>נתוני מודעות:</strong> בזמן פרסום; בארכיון שנה לאחר הסרה</li>
          <li><strong>רשומות חיוב:</strong> 7 שנים (חוק המס הישראלי)</li>
          <li><strong>יומני אבטחה:</strong> עד 12 חודשים</li>
          <li><strong>נתוני לקוחות שהעלאתם:</strong> נמחקים תוך 30 יום מסגירת החשבון</li>
        </ul>
      </S>
      <S heading="6. זכויותיכם על פי חוק הגנת הפרטיות הישראלי" highlight>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>עיון</strong> — בקשת עותק מהמידע שאנחנו מחזיקים עליכם</li>
          <li><strong>תיקון</strong> — בקשת תיקון מידע שגוי, חלקי או מיושן</li>
          <li><strong>מחיקה</strong> — בקשת מחיקת מידע כשאין בסיס חוקי להמשך שמירתו</li>
          <li><strong>התנגדות לדיוור ישיר</strong> — הסרה בכל עת</li>
          <li><strong>ביטול הסכמה</strong> — בכל עת, מבלי לפגוע בחוקיות העיבוד הקודם</li>
          <li><strong>תלונה</strong> — הגשת תלונה ל<PPA label="הרשות להגנת הפרטיות" /></li>
        </ul>
        <p className="mt-3 text-xs text-gray-600">שלחו אימייל ל-<EM /> למימוש כל זכות. כנדרש בחוק הגנת הפרטיות הישראלי, נשיב תוך <strong>30 יום</strong>.</p>
      </S>
      <S heading="7. עוגיות (Cookies) וטכנולוגיות דומות">
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>עוגיות חיוניות</strong> — נדרשות לכניסה לחשבון ואבטחה; פעילות תמיד.</li>
          <li><strong>עוגיות פונקציונליות</strong> — שומרות את העדפת השפה; פעילות בהסכמה בלבד.</li>
        </ul>
        <p className="mt-2">אנחנו לא משתמשים בעוגיות פרסום, פרופיילינג או מעקב של צד שלישי.</p>
      </S>
      <S heading="8. אבטחה">
        <p>אנחנו מיישמים הצפנת TLS, Row-Level Security של Supabase, אכיפת סשן יחיד ובקרות גישה. במקרה של אירוע אבטחה חמור, נודיע לרשות להגנת הפרטיות תוך 72 שעות ולמשתמשים שנפגעו לפי הדרישות.</p>
      </S>
      <S heading="9. קטינים">
        <p>BebKey אינה מיועדת לבני פחות מ-18. צרו קשר להסרת מידע שנמסר על-ידי קטין.</p>
      </S>
      <S heading="10. שינויים במדיניות זו">
        <p>שינויים מהותיים יימסרו באימייל ובהודעה באתר. תאריך "עודכן לאחרונה" משקף את הגרסה העדכנית.</p>
      </S>
      <S heading="11. צור קשר">
        <p>שאלות בנושא פרטיות: <EM /></p>
        <p className="mt-1">ניתן גם להגיש תלונה ישירות ל<PPA label="הרשות להגנת הפרטיות" />.</p>
      </S>
    </>
  )
}

// ── Russian ──────────────────────────────────────────────────────────────────
function Ru() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Политика конфиденциальности</h1>
      <p className="text-gray-400 text-xs mb-2">Последнее обновление: июль 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        Опубликована в соответствии с <strong>Законом о защите персональных данных, 5741-1981</strong>{' '}
        и <strong>Поправкой №13 (2024)</strong>, вступившей в силу 14 августа 2025 года.
      </p>
      <S heading="1. Оператор персональных данных">
        <p>BebKey («мы») управляет сайтом <strong>bebkey.com</strong> и является оператором персональных данных, обрабатываемых через этот сайт.</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>Запросы по конфиденциальности:</strong> <EM /></li>
          <li><strong>Надзорный орган:</strong> <PPA label="Израильское управление по защите персональных данных (PPA)" /></li>
        </ul>
      </S>
      <S heading="2. Персональные данные, которые мы собираем">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="text-left px-3 py-2">Тип</th>
                <th className="text-left px-3 py-2">Примеры</th>
                <th className="text-left px-3 py-2">Обязательно?</th>
                <th className="text-left px-3 py-2">Цель</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr><td className="px-3 py-2 font-medium">Данные аккаунта</td><td className="px-3 py-2">E-mail, имя, телефон, роль</td><td className="px-3 py-2">Обязательно</td><td className="px-3 py-2">Аутентификация и предоставление сервиса</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">Профиль агента</td><td className="px-3 py-2">Номер лицензии, название агентства, фото</td><td className="px-3 py-2">Для агентов</td><td className="px-3 py-2">Публичный профиль</td></tr>
              <tr><td className="px-3 py-2 font-medium">Данные объявлений</td><td className="px-3 py-2">Описание объекта, фото, цена</td><td className="px-3 py-2">Для публикации</td><td className="px-3 py-2">Размещение объявлений</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">Данные клиентов</td><td className="px-3 py-2">Контакты, загруженные в панель</td><td className="px-3 py-2">Добровольно</td><td className="px-3 py-2">Подбор клиентов</td></tr>
              <tr><td className="px-3 py-2 font-medium">Данные использования</td><td className="px-3 py-2">Страницы, поиски, фильтры</td><td className="px-3 py-2">Автоматически (необходимо)</td><td className="px-3 py-2">Работа платформы и безопасность</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">Платёжные данные</td><td className="px-3 py-2">История счетов, тип плана</td><td className="px-3 py-2">Для платных планов</td><td className="px-3 py-2">Обрабатывается Lemon Squeezy — мы не видим данных карты</td></tr>
              <tr><td className="px-3 py-2 font-medium">Технические данные</td><td className="px-3 py-2">IP, браузер, токен сессии</td><td className="px-3 py-2">Автоматически (необходимо)</td><td className="px-3 py-2">Безопасность и предотвращение мошенничества</td></tr>
            </tbody>
          </table>
        </div>
      </S>
      <S heading="3. Как и зачем мы используем ваши данные">
        <ul className="list-disc list-inside space-y-2 text-gray-600">
          <li>Создание и управление аккаунтом, верификация личности</li>
          <li>Публикация объявлений и работа уведомлений о совпадениях</li>
          <li>Обработка платежей и управление историей счетов</li>
          <li>Отправка транзакционных писем (чеки, совпадения, уведомления безопасности)</li>
          <li>Выявление мошенничества и несанкционированного доступа</li>
          <li>Улучшение платформы и исправление ошибок</li>
          <li>Соблюдение правовых обязательств по израильскому законодательству</li>
        </ul>
        <p className="mt-2">Мы <strong>не</strong> используем ваши данные для поведенческой рекламы. Мы <strong>не</strong> продаём персональные данные.</p>
      </S>
      <S heading="4. Кто получает ваши данные">
        <ul className="list-disc list-inside space-y-2 text-gray-600 mt-2">
          <li><strong>Supabase Inc.</strong> (США) — хостинг базы данных и аутентификация на основании договора об обработке данных.</li>
          <li><strong>Lemon Squeezy Inc.</strong> (США) — платёжный процессинг; мы получаем только анонимизированные данные о выставлении счетов.</li>
          <li><strong>Израильские органы власти</strong> — при наличии обязательного судебного или регуляторного предписания.</li>
        </ul>
      </S>
      <S heading="5. Сроки хранения данных">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li><strong>Данные аккаунта:</strong> период активности + 2 года после закрытия (если не запрошено удаление)</li>
          <li><strong>Данные объявлений:</strong> в период публикации; архив 1 год после удаления</li>
          <li><strong>Записи о выставлении счетов:</strong> 7 лет (израильское налоговое законодательство)</li>
          <li><strong>Журналы безопасности:</strong> до 12 месяцев</li>
          <li><strong>Данные клиентов, загруженные вами:</strong> удаляются в течение 30 дней после закрытия аккаунта</li>
        </ul>
      </S>
      <S heading="6. Ваши права по израильскому законодательству о защите данных" highlight>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Доступ</strong> — запросить копию хранящихся данных о вас</li>
          <li><strong>Исправление</strong> — запросить исправление неточных или неполных данных</li>
          <li><strong>Удаление</strong> — запросить удаление данных при отсутствии правового основания для их хранения</li>
          <li><strong>Возражение против прямого маркетинга</strong> — отказаться в любое время</li>
          <li><strong>Отзыв согласия</strong> — в любое время, без ущерба для правомерности предшествующей обработки</li>
          <li><strong>Жалоба</strong> — подать жалобу в <PPA label="Управление по защите персональных данных Израиля" /></li>
        </ul>
        <p className="mt-3 text-xs text-gray-600">Напишите на <EM /> для реализации любого из прав. Согласно требованиям израильского закона о защите персональных данных, мы отвечаем в течение <strong>30 дней</strong>.</p>
      </S>
      <S heading="7. Файлы cookie и аналогичные технологии">
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>Необходимые файлы cookie</strong> — требуются для входа и безопасности; всегда активны.</li>
          <li><strong>Функциональные файлы cookie</strong> — запоминают языковые настройки; активны с вашего согласия.</li>
        </ul>
        <p className="mt-2">Мы не используем рекламные, профилирующие или сторонние отслеживающие файлы cookie.</p>
      </S>
      <S heading="8. Безопасность">
        <p>Мы применяем шифрование TLS, Row-Level Security Supabase, принудительную одиночную сессию и контроль доступа. В случае серьёзного инцидента уведомляем PPA в течение 72 часов и информируем пострадавших пользователей.</p>
      </S>
      <S heading="9. Несовершеннолетние">
        <p>BebKey не предназначен для лиц младше 18 лет. Свяжитесь с нами для удаления данных, предоставленных несовершеннолетним.</p>
      </S>
      <S heading="10. Изменения в настоящей Политике">
        <p>Существенные изменения сообщаются по электронной почте и уведомлением на сайте. Дата «Последнее обновление» отражает последнюю редакцию.</p>
      </S>
      <S heading="11. Контакты">
        <p>Вопросы о конфиденциальности: <EM /></p>
        <p className="mt-1">Вы также можете подать жалобу непосредственно в <PPA label="Управление по защите персональных данных Израиля" />.</p>
      </S>
    </>
  )
}

// ── Arabic ───────────────────────────────────────────────────────────────────
function Ar() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">سياسة الخصوصية</h1>
      <p className="text-gray-400 text-xs mb-2">آخر تحديث: يوليو 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        تُنشر وفقًا لـ<strong>قانون حماية الخصوصية، 5741-1981</strong> و<strong>التعديل رقم 13 (2024)</strong>، النافذ منذ 14 أغسطس 2025.
      </p>
      <S heading="1. المتحكم في البيانات">
        <p>تُشغّل BebKey («نحن») موقع <strong>bebkey.com</strong> وهي المتحكم في البيانات الشخصية المعالَجة عبر هذا الموقع.</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>طلبات الخصوصية:</strong> <EM /></li>
          <li><strong>السلطة الرقابية:</strong> <PPA label="هيئة حماية الخصوصية الإسرائيلية" /></li>
        </ul>
      </S>
      <S heading="2. البيانات الشخصية التي نجمعها">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="text-right px-3 py-2">النوع</th>
                <th className="text-right px-3 py-2">أمثلة</th>
                <th className="text-right px-3 py-2">إلزامي؟</th>
                <th className="text-right px-3 py-2">الغرض</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr><td className="px-3 py-2 font-medium">بيانات الحساب</td><td className="px-3 py-2">البريد الإلكتروني، الاسم، الهاتف، الدور</td><td className="px-3 py-2">إلزامي</td><td className="px-3 py-2">المصادقة وتقديم الخدمة</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">ملف الوكيل</td><td className="px-3 py-2">رقم الرخصة، اسم المكتب، الصورة</td><td className="px-3 py-2">للوكلاء</td><td className="px-3 py-2">عرض الملف العام</td></tr>
              <tr><td className="px-3 py-2 font-medium">بيانات الإعلانات</td><td className="px-3 py-2">تفاصيل العقار، الصور، السعر</td><td className="px-3 py-2">للنشر</td><td className="px-3 py-2">نشر الإعلانات</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">بيانات العملاء</td><td className="px-3 py-2">جهات الاتصال المُحمَّلة للوحة التحكم</td><td className="px-3 py-2">اختياري</td><td className="px-3 py-2">مطابقة العملاء</td></tr>
              <tr><td className="px-3 py-2 font-medium">بيانات الاستخدام</td><td className="px-3 py-2">الصفحات، عمليات البحث، المرشحات</td><td className="px-3 py-2">تلقائي (ضروري)</td><td className="px-3 py-2">تشغيل المنصة والأمان</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">بيانات الدفع</td><td className="px-3 py-2">سجل الفواتير، نوع الخطة</td><td className="px-3 py-2">للخطط المدفوعة</td><td className="px-3 py-2">تعالجها Lemon Squeezy — لا نرى تفاصيل البطاقة</td></tr>
              <tr><td className="px-3 py-2 font-medium">البيانات التقنية</td><td className="px-3 py-2">IP، المتصفح، رمز الجلسة</td><td className="px-3 py-2">تلقائي (ضروري)</td><td className="px-3 py-2">الأمان ومنع الاحتيال</td></tr>
            </tbody>
          </table>
        </div>
      </S>
      <S heading="3. كيف ولماذا نستخدم بياناتكم">
        <ul className="list-disc list-inside space-y-2 text-gray-600">
          <li>إنشاء حسابكم وإدارته والتحقق من هويتكم</li>
          <li>نشر الإعلانات وتشغيل تنبيهات مطابقة العملاء</li>
          <li>معالجة مدفوعات الاشتراك وإدارة الفواتير</li>
          <li>إرسال رسائل بريد إلكتروني (الإيصالات والمطابقات وإشعارات الأمان)</li>
          <li>رصد الاحتيال والإساءة والوصول غير المصرح</li>
          <li>تحسين أداء المنصة وإصلاح الأخطاء</li>
          <li>الامتثال للالتزامات القانونية بموجب القانون الإسرائيلي</li>
        </ul>
        <p className="mt-2">لا نستخدم بياناتكم للإعلانات السلوكية. لا نبيع بياناتكم الشخصية.</p>
      </S>
      <S heading="4. من يتلقى بياناتكم">
        <ul className="list-disc list-inside space-y-2 text-gray-600 mt-2">
          <li><strong>Supabase Inc.</strong> (الولايات المتحدة) — استضافة قاعدة البيانات والمصادقة بموجب اتفاقية معالجة البيانات.</li>
          <li><strong>Lemon Squeezy Inc.</strong> (الولايات المتحدة) — معالجة المدفوعات؛ نتلقى فقط بيانات الفوترة المجهولة الهوية.</li>
          <li><strong>السلطات الإسرائيلية</strong> — عند الاقتضاء بموجب أمر قانوني ملزم.</li>
        </ul>
      </S>
      <S heading="5. مدة الاحتفاظ ببياناتكم">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li><strong>بيانات الحساب:</strong> فترة النشاط + سنتان بعد الإغلاق (ما لم يُطلب الحذف)</li>
          <li><strong>بيانات الإعلانات:</strong> فترة النشر؛ أرشفة سنة بعد الإزالة</li>
          <li><strong>سجلات الفواتير:</strong> 7 سنوات (قانون الضرائب الإسرائيلي)</li>
          <li><strong>سجلات الأمان:</strong> حتى 12 شهرًا</li>
          <li><strong>بيانات العملاء التي تحملونها:</strong> تُحذف خلال 30 يومًا من إغلاق الحساب</li>
        </ul>
      </S>
      <S heading="6. حقوقكم بموجب قانون الخصوصية الإسرائيلي" highlight>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>الوصول</strong> — طلب نسخة من البيانات التي نحتفظ بها عنكم</li>
          <li><strong>التصحيح</strong> — طلب تصحيح البيانات غير الدقيقة أو غير المكتملة</li>
          <li><strong>الحذف</strong> — طلب حذف البيانات عند انعدام الأساس القانوني للاحتفاظ بها</li>
          <li><strong>الاعتراض على التسويق المباشر</strong> — الإلغاء في أي وقت</li>
          <li><strong>سحب الموافقة</strong> — في أي وقت دون المساس بمشروعية المعالجة السابقة</li>
          <li><strong>تقديم شكوى</strong> — إلى <PPA label="هيئة حماية الخصوصية الإسرائيلية" /></li>
        </ul>
        <p className="mt-3 text-xs text-gray-600">أرسلوا بريدًا إلكترونيًا إلى <EM /> لممارسة أي حق. وفقًا لما يقتضيه قانون حماية الخصوصية الإسرائيلي، نرد خلال <strong>30 يومًا</strong>.</p>
      </S>
      <S heading="7. ملفات تعريف الارتباط والتقنيات المماثلة">
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>ملفات تعريف الارتباط الضرورية</strong> — مطلوبة لتسجيل الدخول والأمان؛ نشطة دائمًا.</li>
          <li><strong>ملفات تعريف الارتباط الوظيفية</strong> — تتذكر تفضيلات اللغة؛ نشطة بموافقتكم.</li>
        </ul>
        <p className="mt-2">لا نستخدم ملفات تعريف الارتباط الإعلانية أو ملفات التتبع.</p>
      </S>
      <S heading="8. الأمان">
        <p>نُطبّق تشفير TLS وأمان مستوى الصف في Supabase وتطبيق جلسة فردية وضوابط الوصول. في حالة وقوع حادثة أمنية خطيرة، نُخطر الهيئة خلال 72 ساعة ونُعلم المستخدمين المتضررين.</p>
      </S>
      <S heading="9. القاصرون">
        <p>BebKey غير موجهة لمن هم دون 18 عامًا. تواصلوا معنا لحذف أي بيانات قدّمها قاصر.</p>
      </S>
      <S heading="10. التغييرات على هذه السياسة">
        <p>يُبلَّغ عن التغييرات الجوهرية عبر البريد الإلكتروني وإشعار على الموقع. يعكس تاريخ «آخر تحديث» أحدث مراجعة.</p>
      </S>
      <S heading="11. التواصل">
        <p>أسئلة حول الخصوصية: <EM /></p>
        <p className="mt-1">يمكنكم أيضًا تقديم شكوى مباشرة إلى <PPA label="هيئة حماية الخصوصية الإسرائيلية" />.</p>
      </S>
    </>
  )
}

// ── French ───────────────────────────────────────────────────────────────────
function Fr() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Politique de confidentialité</h1>
      <p className="text-gray-400 text-xs mb-2">Dernière mise à jour : juillet 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        Publiée conformément à la <strong>Loi sur la protection de la vie privée, 5741-1981</strong>{' '}
        et à l'<strong>Amendement n°13 (2024)</strong>, en vigueur depuis le 14 août 2025.
      </p>
      <S heading="1. Responsable du traitement">
        <p>BebKey («nous») exploite <strong>bebkey.com</strong> et est responsable du traitement des données personnelles via ce site.</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>Demandes relatives à la vie privée :</strong> <EM /></li>
          <li><strong>Autorité de contrôle :</strong> <PPA label="Autorité israélienne de protection de la vie privée (PPA)" /></li>
        </ul>
      </S>
      <S heading="2. Données personnelles que nous collectons">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">Exemples</th>
                <th className="text-left px-3 py-2">Obligatoire ?</th>
                <th className="text-left px-3 py-2">Finalité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr><td className="px-3 py-2 font-medium">Données de compte</td><td className="px-3 py-2">E-mail, nom, téléphone, rôle</td><td className="px-3 py-2">Obligatoire</td><td className="px-3 py-2">Authentification et fourniture du service</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">Profil agent</td><td className="px-3 py-2">N° de licence, agence, photo</td><td className="px-3 py-2">Pour les agents</td><td className="px-3 py-2">Affichage du profil public</td></tr>
              <tr><td className="px-3 py-2 font-medium">Données d'annonces</td><td className="px-3 py-2">Détails du bien, photos, prix</td><td className="px-3 py-2">Pour publier</td><td className="px-3 py-2">Publication d'annonces</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">Données clients</td><td className="px-3 py-2">Contacts importés dans le tableau de bord</td><td className="px-3 py-2">Facultatif</td><td className="px-3 py-2">Correspondance agent-client</td></tr>
              <tr><td className="px-3 py-2 font-medium">Données d'utilisation</td><td className="px-3 py-2">Pages, recherches, filtres</td><td className="px-3 py-2">Automatique (essentiel)</td><td className="px-3 py-2">Fonctionnement et sécurité</td></tr>
              <tr className="bg-gray-50"><td className="px-3 py-2 font-medium">Données de paiement</td><td className="px-3 py-2">Historique de facturation, type de plan</td><td className="px-3 py-2">Pour les plans payants</td><td className="px-3 py-2">Traitement par Lemon Squeezy — nous ne voyons pas les coordonnées bancaires</td></tr>
              <tr><td className="px-3 py-2 font-medium">Données techniques</td><td className="px-3 py-2">IP, navigateur, token de session</td><td className="px-3 py-2">Automatique (essentiel)</td><td className="px-3 py-2">Sécurité et prévention des fraudes</td></tr>
            </tbody>
          </table>
        </div>
      </S>
      <S heading="3. Comment et pourquoi nous utilisons vos données">
        <ul className="list-disc list-inside space-y-2 text-gray-600">
          <li>Créer et gérer votre compte et vérifier votre identité</li>
          <li>Publier des annonces et faire fonctionner les alertes de correspondance</li>
          <li>Traiter les paiements d'abonnement et gérer la facturation</li>
          <li>Envoyer des e-mails transactionnels (reçus, correspondances, avis de sécurité)</li>
          <li>Détecter les fraudes, abus et accès non autorisés</li>
          <li>Améliorer la plateforme et corriger les bugs</li>
          <li>Respecter nos obligations légales en vertu du droit israélien</li>
        </ul>
        <p className="mt-2">Nous n'utilisons <strong>pas</strong> vos données à des fins de publicité comportementale. Nous ne <strong>vendons pas</strong> vos données personnelles.</p>
      </S>
      <S heading="4. Qui reçoit vos données">
        <ul className="list-disc list-inside space-y-2 text-gray-600 mt-2">
          <li><strong>Supabase Inc.</strong> (États-Unis) — hébergement de base de données et authentification, sous contrat de traitement des données.</li>
          <li><strong>Lemon Squeezy Inc.</strong> (États-Unis) — traitement des paiements ; nous ne recevons que des métadonnées de facturation anonymisées.</li>
          <li><strong>Autorités israéliennes</strong> — sur injonction légale contraignante.</li>
        </ul>
      </S>
      <S heading="5. Durées de conservation">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li><strong>Données de compte :</strong> période active + 2 ans après fermeture (sauf demande de suppression)</li>
          <li><strong>Données d'annonces :</strong> pendant la publication ; archivées 1 an après suppression</li>
          <li><strong>Enregistrements de facturation :</strong> 7 ans (droit fiscal israélien)</li>
          <li><strong>Journaux de sécurité :</strong> jusqu'à 12 mois</li>
          <li><strong>Données clients importées :</strong> supprimées dans les 30 jours suivant la fermeture du compte</li>
        </ul>
      </S>
      <S heading="6. Vos droits en vertu du droit israélien sur la vie privée" highlight>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Accès</strong> — obtenir une copie des données vous concernant</li>
          <li><strong>Rectification</strong> — demander la correction de données inexactes ou incomplètes</li>
          <li><strong>Suppression</strong> — demander la suppression si aucune base légale ne justifie la conservation</li>
          <li><strong>Opposition au marketing direct</strong> — se désinscrire à tout moment</li>
          <li><strong>Retrait du consentement</strong> — à tout moment, sans affecter la licéité du traitement antérieur</li>
          <li><strong>Réclamation</strong> — auprès de l'<PPA label="Autorité israélienne de protection de la vie privée" /></li>
        </ul>
        <p className="mt-3 text-xs text-gray-600">Écrivez à <EM /> pour exercer l'un de ces droits. Comme l'exige le droit israélien sur la protection de la vie privée, nous répondons sous <strong>30 jours</strong>.</p>
      </S>
      <S heading="7. Cookies et technologies similaires">
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>Cookies essentiels</strong> — nécessaires à la connexion et à la sécurité ; toujours actifs.</li>
          <li><strong>Cookies fonctionnels</strong> — mémorisent la préférence de langue ; actifs avec votre consentement.</li>
        </ul>
        <p className="mt-2">Nous n'utilisons pas de cookies publicitaires, de profilage ou de suivi tiers.</p>
      </S>
      <S heading="8. Sécurité">
        <p>Nous appliquons le chiffrement TLS, la sécurité au niveau des lignes Supabase, la session unique obligatoire et des contrôles d'accès stricts. En cas d'incident grave, nous notifions l'autorité PPA dans les 72 heures et informons les utilisateurs concernés.</p>
      </S>
      <S heading="9. Mineurs">
        <p>BebKey ne s'adresse pas aux personnes de moins de 18 ans. Contactez-nous pour supprimer des données soumises par un mineur.</p>
      </S>
      <S heading="10. Modifications de cette Politique">
        <p>Les changements substantiels sont notifiés par e-mail et par avis sur le site. La date «Dernière mise à jour» reflète la révision la plus récente.</p>
      </S>
      <S heading="11. Contact">
        <p>Questions de confidentialité : <EM /></p>
        <p className="mt-1">Vous pouvez également déposer une réclamation auprès de l'<PPA label="Autorité israélienne de protection de la vie privée" />.</p>
      </S>
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Privacy() {
  useSeo({
    title: 'Privacy Policy',
    description: 'How BebKey collects, uses, and protects your personal information.',
  })
  const { i18n } = useTranslation()
  const lang = ['he', 'ar', 'ru', 'fr'].includes(i18n.language) ? i18n.language : 'en'
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-gray-700 text-sm leading-relaxed">
      {lang === 'en' && <En />}
      {lang === 'he' && <He />}
      {lang === 'ru' && <Ru />}
      {lang === 'ar' && <Ar />}
      {lang === 'fr' && <Fr />}
    </div>
  )
}

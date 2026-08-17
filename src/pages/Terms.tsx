import { useTranslation } from 'react-i18next'
import { useSeo } from '../hooks/useSeo'

const EM = () => (
  <a href="mailto:support@bebkey.com" className="text-brand-blue underline">
    support@bebkey.com
  </a>
)
const RefundLink = ({ label }: { label: string }) => (
  <a href="/refund" className="text-brand-blue underline">{label}</a>
)
const PrivacyLink = ({ label }: { label: string }) => (
  <a href="/privacy" className="text-brand-blue underline">{label}</a>
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
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
      <p className="text-gray-400 text-xs mb-8">Last updated: July 2026</p>
      <S heading="1. About Us">
        <p>BebKey ("the Company", "we", "us") operates <strong>bebkey.com</strong>, a real estate listing and agent-management platform for the Israeli property market.</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>Business name:</strong> BebKey</li>
          <li><strong>Email:</strong> <EM /></li>
          <li><strong>Jurisdiction:</strong> State of Israel</li>
        </ul>
        <p className="mt-2">By using BebKey you confirm you have read, understood, and agree to these Terms.</p>
      </S>
      <S heading="2. Description of Service">
        <p>BebKey provides property search, listing publication, client-matching alerts, an agent dashboard, and subscription-based access tiers for the Israeli real estate market.</p>
      </S>
      <S heading="3. Eligibility">
        <p>You must be at least <strong>18 years old</strong> to register. To publish listings or use paid agent features you must hold a valid Israeli real estate brokerage licence (Real Estate Agents Law 5756-1996). General search is available to all users.</p>
      </S>
      <S heading="4. Subscriptions & Automatic Renewal">
        <p>Paid plans are billed monthly and <strong>renew automatically</strong> unless cancelled before the renewal date. You will receive a reminder email before each renewal.</p>
        <p className="mt-2">Payments are processed by <strong>Lemon Squeezy Inc.</strong>, our Merchant of Record. By subscribing you authorise Lemon Squeezy to charge your payment method on a recurring basis. Lemon Squeezy issues tax invoices (חשבונית מס) inclusive of Israeli VAT (currently 18%); credit notes (חשבונית זיכוי) are issued upon approved refunds. See our <RefundLink label="Refund Policy" /> for details.</p>
        <p className="mt-2">Price changes are communicated at least <strong>30 days in advance</strong>. Continued use constitutes acceptance.</p>
      </S>
      <S heading="5. Your Right to Cancel — Israeli Consumer Protection Law" highlight>
        <p className="font-medium text-gray-800">Under the Consumer Protection Law 5741-1981 and Regulations (Cancellation of Transaction) 5771-2010:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-3">
          <li><strong>14-day cooling-off period:</strong> Cancel within 14 days of purchase, even if you have started using the service.</li>
          <li><strong>Cancellation fee cap:</strong> We may retain up to <strong>5% of the subscription price or ₪100</strong>, whichever is lower. No fee if service has not yet started.</li>
          <li><strong>After 14 days:</strong> Cancel at any time; no further charges after the current billing period. See our <RefundLink label="Refund Policy" />.</li>
          <li><strong>How to cancel:</strong> Email <EM /> or use "Manage Subscription" in your Profile page.</li>
        </ul>
      </S>
      <S heading="6. Acceptable Use">
        <p>You agree not to:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-1">
          <li>Scrape or bulk-copy listing data without written permission</li>
          <li>Create false, misleading, or duplicate listings</li>
          <li>Impersonate other users or BebKey staff</li>
          <li>Use the platform for spam, phishing, or unsolicited marketing</li>
          <li>Circumvent subscription access restrictions</li>
          <li>Violate any applicable Israeli or international law</li>
        </ul>
      </S>
      <S heading="7. Intellectual Property">
        <p>All content, logos, code, and design are the exclusive property of BebKey or its licensors. You retain ownership of content you upload and grant BebKey a non-exclusive licence to display it on the platform.</p>
      </S>
      <S heading="8. Platform Nature — Aggregation Dashboard Only" highlight>
        <p className="font-semibold text-gray-800 mb-3">IMPORTANT: Please read this section carefully before using BebKey.</p>
        <p>BebKey operates exclusively as a <strong>technology aggregation platform and information dashboard</strong>. We collect and display real estate listing data sourced from publicly available third-party websites, databases, and APIs. We are not a real estate broker, agency, advisor, or intermediary of any kind.</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-3">
          <li><strong>No verification of listings:</strong> BebKey does not create, verify, validate, or independently confirm any listing information. All data is provided "as aggregated" from external sources and may be incomplete, outdated, inaccurate, or no longer available.</li>
          <li><strong>No involvement in transactions:</strong> BebKey has no involvement whatsoever in any property transaction, negotiation, offer, agreement, or contract between any buyer, renter, seller, landlord, or agent. All such dealings are conducted solely and exclusively between the relevant parties.</li>
          <li><strong>No brokerage services:</strong> Nothing on this platform constitutes brokerage, legal, financial, investment, or professional real estate advice. You should seek independent professional counsel before making any property-related decision.</li>
          <li><strong>Assumption of risk:</strong> You acknowledge and agree that you rely on any information displayed on BebKey entirely at your own risk. BebKey expressly disclaims all liability arising from your reliance on any listing data, price, availability, or description shown on the platform.</li>
          <li><strong>Third-party sources:</strong> Listing data originates from third-party sources over which BebKey exercises no editorial control. BebKey makes no representations as to the accuracy, completeness, currency, or reliability of any such data.</li>
          <li><strong>Due diligence:</strong> It is your sole responsibility to independently verify all listing details, conduct appropriate due diligence, and consult qualified professionals before entering into any property transaction.</li>
        </ul>
      </S>
      <S heading="9. Limitation of Liability">
        <p>BebKey is provided "as is" and "as available," without warranty of any kind, express or implied. To the fullest extent permitted by applicable law, BebKey, its directors, employees, and affiliates shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from your use of, or inability to use, the platform or any information obtained through it.</p>
        <p className="mt-2">Our total aggregate liability for any claim shall not exceed the amount you paid us in the <strong>three months</strong> preceding the claim, or ₪100, whichever is lower.</p>
      </S>
      <S heading="10. Privacy">
        <p>Your use of BebKey is subject to our <PrivacyLink label="Privacy Policy" />, which complies with the Protection of Privacy Law 5741-1981 and Amendment No. 13 (effective August 14, 2025).</p>
      </S>
      <S heading="11. Termination">
        <p>We may suspend or terminate your account if you breach these Terms or are required to do so by law. You may close your account at any time by contacting us.</p>
      </S>
      <S heading="12. Changes to These Terms">
        <p>Material changes are communicated by email and/or prominent notice at least <strong>14 days</strong> before they take effect. Continued use constitutes acceptance.</p>
      </S>
      <S heading="13. Governing Law & Disputes">
        <p>These Terms are governed by the laws of the <strong>State of Israel</strong>. Disputes are subject to the exclusive jurisdiction of courts in <strong>Tel Aviv-Yafo, Israel</strong>.</p>
      </S>
      <S heading="14. Contact">
        <p>Questions? <EM /></p>
      </S>
    </>
  )
}

// ── Hebrew ───────────────────────────────────────────────────────────────────
function He() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">תנאי שימוש</h1>
      <p className="text-gray-400 text-xs mb-8">עודכן לאחרונה: יולי 2026</p>
      <S heading="1. אודותינו">
        <p>BebKey ("החברה", "אנחנו") מפעילה את <strong>bebkey.com</strong>, פלטפורמת נדל"ן לניהול מודעות ותיווך בשוק הישראלי.</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>שם עסק:</strong> BebKey</li>
          <li><strong>אימייל:</strong> <EM /></li>
          <li><strong>סמכות שיפוט:</strong> מדינת ישראל</li>
        </ul>
        <p className="mt-2">בשימוש ב-BebKey אתם מאשרים שקראתם, הבנתם ומסכימים לתנאים אלו.</p>
      </S>
      <S heading="2. תיאור השירות">
        <p>BebKey מספקת חיפוש נכסים, פרסום מודעות, התראות התאמת לקוחות, לוח בקרה לסוכנים ומנויים בתשלום לשוק הנדל"ן הישראלי.</p>
      </S>
      <S heading="3. כשירות">
        <p>עליכם להיות לפחות בני <strong>18</strong> כדי להירשם. לפרסום מודעות או שימוש בפיצ'רים בתשלום נדרש רישיון תיווך ישראלי בתוקף (חוק המתווכים במקרקעין תשנ"ו-1996). חיפוש כללי פתוח לכל המשתמשים.</p>
      </S>
      <S heading="4. מנויים וחידוש אוטומטי">
        <p>תוכניות בתשלום מחויבות מדי חודש ו<strong>מתחדשות אוטומטית</strong> אלא אם כן בוטלו לפני תאריך החידוש. תישלח אליכם תזכורת לפני כל חידוש.</p>
        <p className="mt-2">התשלומים מעובדים על-ידי <strong>Lemon Squeezy Inc.</strong>, ה-Merchant of Record שלנו. בהרשמה למנוי אתם מסמיכים את Lemon Squeezy לחייב את אמצעי התשלום שלכם באופן חוזר. Lemon Squeezy מנפיקה <strong>חשבונית מס</strong> כולל מע"מ ישראלי (כיום 18%); <strong>חשבונית זיכוי</strong> תונפק בעת אישור החזר. פירוט מלא ב<RefundLink label="מדיניות ההחזרים" /> שלנו.</p>
        <p className="mt-2">שינויי מחיר יימסרו לפחות <strong>30 יום מראש</strong>. המשך שימוש מהווה הסכמה.</p>
      </S>
      <S heading="5. זכות הביטול — חוק הגנת הצרכן" highlight>
        <p className="font-medium text-gray-800">בהתאם לחוק הגנת הצרכן תשמ"א-1981 ותקנות הגנת הצרכן (ביטול עסקה) תשע"א-2010:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-3">
          <li><strong>תקופת ביטול של 14 יום:</strong> ניתן לבטל תוך 14 יום מהרכישה, גם אם כבר התחלתם להשתמש בשירות.</li>
          <li><strong>דמי ביטול מוגבלים:</strong> נוכל לנכות עד <strong>5% ממחיר המנוי או ₪100</strong>, הנמוך מביניהם. אין חיוב אם השירות טרם החל.</li>
          <li><strong>לאחר 14 יום:</strong> ניתן לבטל בכל עת; לא יגבו חיובים נוספים לאחר תום תקופת החיוב הנוכחית. ראו <RefundLink label="מדיניות ההחזרים" /> שלנו.</li>
          <li><strong>כיצד לבטל:</strong> שלחו אימייל ל-<EM /> או השתמשו באפשרות "ניהול מנוי" בדף הפרופיל.</li>
        </ul>
      </S>
      <S heading="6. שימוש מותר">
        <p>אתם מתחייבים שלא:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-1">
          <li>לאסוף נתוני מודעות בכמות גדולה ללא אישור בכתב</li>
          <li>ליצור מודעות כוזבות, מטעות או כפולות</li>
          <li>להתחזות למשתמשים אחרים או לצוות BebKey</li>
          <li>להשתמש בפלטפורמה לספאם, פישינג או שיווק לא מבוקש</li>
          <li>לעקוף מגבלות גישה של מנוי</li>
          <li>להפר כל חוק ישראלי או בינלאומי רלוונטי</li>
        </ul>
      </S>
      <S heading="7. קניין רוחני">
        <p>כל התכנים, הלוגואים, הקוד והעיצוב הם רכושה הבלעדי של BebKey או נותני הרישיון שלה. אתם שומרים על בעלות תכנים שהעלאתם ומעניקים ל-BebKey רישיון לא-בלעדי להציגם בפלטפורמה.</p>
      </S>
      <S heading="8. אופי הפלטפורמה — לוח מחוונים לאיסוף מידע בלבד" highlight>
        <p className="font-semibold text-gray-800 mb-3">חשוב: נא לקרוא סעיף זה בעיון לפני השימוש ב-BebKey.</p>
        <p>BebKey פועלת אך ורק כ<strong>פלטפורמה טכנולוגית לאיסוף מידע ולוח מחוונים</strong>. אנו אוספים ומציגים נתוני נדל"ן ממקורות צד שלישי הזמינים לציבור — אתרים, מסדי נתונים וממשקי API. איננו מתווכי נדל"ן, סוכנות, יועצים או כל גורם מתווך אחר.</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-3">
          <li><strong>אין אימות מודעות:</strong> BebKey אינה יוצרת, מאמתת, בודקת או מאשרת באופן עצמאי מידע כלשהו במודעות. כל הנתונים מסופקים "כפי שנאספו" ממקורות חיצוניים ועשויים להיות חלקיים, מיושנים, לא מדויקים או אינם זמינים עוד.</li>
          <li><strong>אין מעורבות בעסקאות:</strong> ל-BebKey אין כל מעורבות בכל עסקת נדל"ן, משא ומתן, הצעה, הסכם או חוזה בין קונה, שוכר, מוכר, בעל נכס או סוכן. כל ההתנהלות מתבצעת אך ורק בין הצדדים הרלוונטיים ישירות.</li>
          <li><strong>אין שירותי תיווך:</strong> שום דבר בפלטפורמה זו אינו מהווה תיווך, ייעוץ משפטי, פיננסי, השקעתי או מקצועי כלשהו בנדל"ן. יש לפנות לגורמים מקצועיים עצמאיים לפני כל החלטה הקשורה לנכס.</li>
          <li><strong>נטילת סיכון:</strong> אתם מכירים ומסכימים כי אתם מסתמכים על כל מידע המוצג ב-BebKey על אחריותכם הבלעדית. BebKey מסירה מפורשות כל אחריות הנובעת מהסתמכות על נתוני מודעות, מחירים, זמינות או תיאורים המוצגים בפלטפורמה.</li>
          <li><strong>מקורות צד שלישי:</strong> נתוני המודעות מגיעים ממקורות צד שלישי שעליהם אין ל-BebKey שליטה עריכתית. BebKey אינה מתחייבת לדיוק, שלמות, עדכניות או אמינות כל נתון כאמור.</li>
          <li><strong>בדיקת נאותות:</strong> באחריותכם הבלעדית לאמת באופן עצמאי את פרטי המודעה, לבצע בדיקת נאותות מתאימה ולהתייעץ עם אנשי מקצוע מוסמכים לפני כניסה לכל עסקת נדל"ן.</li>
        </ul>
      </S>
      <S heading="9. הגבלת אחריות">
        <p>BebKey מסופקת "כמות שהיא" ו"כפי שזמינה", ללא כל אחריות מכל סוג, מפורשת או משתמעת. במידה המרבית המותרת על פי דין, BebKey, מנהליה, עובדיה וחברות קשורות אליה לא יישאו בכל אחריות לנזקים ישירים, עקיפים, מקריים, מיוחדים, תוצאתיים או עונשיים הנובעים מהשימוש בפלטפורמה או מאי-יכולת השימוש בה.</p>
        <p className="mt-2">סך חבותנו הכוללת לכל תביעה לא תעלה על הסכום ששילמתם לנו ב<strong>שלושת החודשים</strong> שקדמו לתביעה, או ₪100 — הנמוך מביניהם.</p>
      </S>
      <S heading="10. פרטיות">
        <p>השימוש שלכם ב-BebKey כפוף ל<PrivacyLink label="מדיניות הפרטיות" /> שלנו, העומדת בדרישות חוק הגנת הפרטיות תשמ"א-1981 ותיקון מס' 13 (בתוקף מ-14 באוגוסט 2025).</p>
      </S>
      <S heading="11. סיום">
        <p>אנו עשויים להשעות או לסיים את חשבונכם אם הפרתם תנאים אלו. ניתן לסגור את החשבון בכל עת על-ידי פנייה אלינו.</p>
      </S>
      <S heading="12. שינויים בתנאים">
        <p>שינויים מהותיים יימסרו באימייל ו/או בהודעה בולטת לפחות <strong>14 יום</strong> לפני כניסתם לתוקף. המשך שימוש מהווה הסכמה.</p>
      </S>
      <S heading="13. דין וסמכות שיפוט">
        <p>תנאים אלה כפופים לדיני <strong>מדינת ישראל</strong>. כל מחלוקת תידון בבתי המשפט המוסמכים ב<strong>תל אביב-יפו, ישראל</strong>.</p>
      </S>
      <S heading="14. צור קשר">
        <p>שאלות? <EM /></p>
      </S>
    </>
  )
}

// ── Russian ──────────────────────────────────────────────────────────────────
function Ru() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Условия использования</h1>
      <p className="text-gray-400 text-xs mb-8">Последнее обновление: июль 2026</p>
      <S heading="1. О нас">
        <p>BebKey («Компания», «мы») управляет сайтом <strong>bebkey.com</strong> — платформой для поиска недвижимости и управления агентами на израильском рынке.</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>Название:</strong> BebKey</li>
          <li><strong>Электронная почта:</strong> <EM /></li>
          <li><strong>Юрисдикция:</strong> Государство Израиль</li>
        </ul>
        <p className="mt-2">Используя BebKey, вы подтверждаете, что прочитали, поняли и согласны с настоящими Условиями.</p>
      </S>
      <S heading="2. Описание сервиса">
        <p>BebKey предоставляет поиск недвижимости, публикацию объявлений, уведомления о совпадениях с клиентами, панель управления для агентов и платные тарифные планы для израильского рынка недвижимости.</p>
      </S>
      <S heading="3. Требования к пользователям">
        <p>Для регистрации необходимо быть старше <strong>18 лет</strong>. Для публикации объявлений и использования платных функций требуется действующая израильская брокерская лицензия (Закон о брокерах по недвижимости 5756-1996). Общий поиск доступен всем пользователям.</p>
      </S>
      <S heading="4. Подписки и автоматическое продление">
        <p>Платные тарифы оплачиваются ежемесячно и <strong>продлеваются автоматически</strong>, если не отменены до даты продления. Перед каждым продлением вы получите напоминание по электронной почте.</p>
        <p className="mt-2">Платежи обрабатываются компанией <strong>Lemon Squeezy Inc.</strong> в качестве нашего Merchant of Record. Оформляя подписку, вы разрешаете Lemon Squeezy регулярно списывать средства с вашего платёжного инструмента. Lemon Squeezy выставляет <strong>налоговый счёт (חשבונית מס)</strong>, включая израильский НДС (в настоящее время 18%); при одобрении возврата выставляется <strong>кредит-нота (חשבונית זיכוי)</strong>. Подробности — в нашей <RefundLink label="Политике возврата" />.</p>
        <p className="mt-2">Об изменениях цен мы уведомляем не менее чем за <strong>30 дней</strong>. Продолжение использования означает согласие с новой ценой.</p>
      </S>
      <S heading="5. Право на отмену — израильское законодательство о защите потребителей" highlight>
        <p className="font-medium text-gray-800">В соответствии с Законом о защите потребителей 5741-1981 и Положением об отмене сделок 5771-2010:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-3">
          <li><strong>14-дневный период охлаждения:</strong> вы можете отменить подписку в течение 14 дней с момента покупки, даже если уже пользовались сервисом.</li>
          <li><strong>Ограничение на комиссию за отмену:</strong> мы можем удержать не более <strong>5% от стоимости подписки или ₪100</strong> (что меньше). Комиссия не взимается, если сервис ещё не начал работу.</li>
          <li><strong>После 14 дней:</strong> вы можете отменить подписку в любое время; дальнейших списаний не будет после текущего расчётного периода. См. нашу <RefundLink label="Политику возврата" />.</li>
          <li><strong>Способ отмены:</strong> напишите на <EM /> или воспользуйтесь опцией «Управление подпиской» в профиле.</li>
        </ul>
      </S>
      <S heading="6. Допустимое использование">
        <p>Вы соглашаетесь не:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-1">
          <li>собирать данные объявлений в большом объёме без письменного разрешения</li>
          <li>создавать ложные, вводящие в заблуждение или дублирующие объявления</li>
          <li>выдавать себя за других пользователей или сотрудников BebKey</li>
          <li>использовать платформу для спама, фишинга или несанкционированного маркетинга</li>
          <li>обходить ограничения доступа по подписке</li>
          <li>нарушать применимое израильское или международное законодательство</li>
        </ul>
      </S>
      <S heading="7. Интеллектуальная собственность">
        <p>Весь контент, логотипы, код и дизайн являются исключительной собственностью BebKey или её лицензиаров. Вы сохраняете право собственности на загружаемый контент и предоставляете BebKey неисключительную лицензию на его отображение на платформе.</p>
      </S>
      <S heading="8. Характер платформы — исключительно информационный агрегатор" highlight>
        <p className="font-semibold text-gray-800 mb-3">Важно: пожалуйста, внимательно прочитайте этот раздел перед использованием BebKey.</p>
        <p>BebKey функционирует исключительно как <strong>технологическая платформа-агрегатор и информационная панель</strong>. Мы собираем и отображаем данные о недвижимости из общедоступных сторонних источников — веб-сайтов, баз данных и API. Мы не являемся риелторским брокером, агентством, консультантом или посредником какого-либо рода.</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-3">
          <li><strong>Отсутствие верификации объявлений:</strong> BebKey не создаёт, не проверяет и не подтверждает самостоятельно какие-либо данные объявлений. Вся информация предоставляется «в агрегированном виде» из внешних источников и может быть неполной, устаревшей, неточной или более недоступной.</li>
          <li><strong>Отсутствие участия в сделках:</strong> BebKey не участвует каким-либо образом ни в каких сделках с недвижимостью, переговорах, предложениях, соглашениях или договорах между покупателями, арендаторами, продавцами, арендодателями или агентами. Все такие отношения осуществляются исключительно между соответствующими сторонами напрямую.</li>
          <li><strong>Отсутствие брокерских услуг:</strong> ничто на данной платформе не является брокерской, юридической, финансовой, инвестиционной или иной профессиональной консультацией по вопросам недвижимости. Перед принятием любого решения, связанного с недвижимостью, следует обращаться к независимым квалифицированным специалистам.</li>
          <li><strong>Принятие рисков:</strong> вы признаёте и соглашаетесь с тем, что полагаетесь на любую информацию, отображаемую на BebKey, исключительно на собственный риск. BebKey прямо отказывается от любой ответственности, возникающей вследствие использования данных объявлений, цен, сведений о доступности или описаний, представленных на платформе.</li>
          <li><strong>Сторонние источники:</strong> данные объявлений поступают из сторонних источников, над которыми BebKey не осуществляет редакционного контроля. BebKey не даёт никаких заверений относительно точности, полноты, актуальности или достоверности таких данных.</li>
          <li><strong>Надлежащая проверка:</strong> вы несёте исключительную ответственность за самостоятельную проверку всех сведений об объявлении, проведение надлежащей проверки и консультацию с квалифицированными специалистами перед заключением любой сделки с недвижимостью.</li>
        </ul>
      </S>
      <S heading="9. Ограничение ответственности">
        <p>BebKey предоставляется «как есть» и «по мере доступности», без каких-либо гарантий, явных или подразумеваемых. В максимальной степени, допустимой применимым законодательством, BebKey, её директора, сотрудники и аффилированные лица не несут ответственности за прямые, косвенные, случайные, специальные, последующие или штрафные убытки, возникающие в результате использования платформы или невозможности её использования.</p>
        <p className="mt-2">Наша совокупная ответственность по любому требованию не превысит сумму, уплаченную вами нам за <strong>три месяца</strong>, предшествующих требованию, или ₪100 — в зависимости от того, что меньше.</p>
      </S>
      <S heading="10. Конфиденциальность">
        <p>Использование BebKey регулируется нашей <PrivacyLink label="Политикой конфиденциальности" />, соответствующей Закону о защите персональных данных 5741-1981 и Поправке №13 (вступила в силу 14 августа 2025 года).</p>
      </S>
      <S heading="11. Прекращение доступа">
        <p>Мы можем приостановить или прекратить действие вашего аккаунта в случае нарушения настоящих Условий. Вы можете закрыть аккаунт в любое время, связавшись с нами.</p>
      </S>
      <S heading="12. Изменения в Условиях">
        <p>О существенных изменениях мы уведомляем по электронной почте и/или путём заметного уведомления на сайте не менее чем за <strong>14 дней</strong>. Продолжение использования означает принятие изменений.</p>
      </S>
      <S heading="13. Применимое право и разрешение споров">
        <p>Настоящие Условия регулируются законодательством <strong>Государства Израиль</strong>. Споры подлежат рассмотрению в судах <strong>Тель-Авив-Яффо, Израиль</strong>.</p>
      </S>
      <S heading="14. Контакты">
        <p>Есть вопросы? <EM /></p>
      </S>
    </>
  )
}

// ── Arabic ───────────────────────────────────────────────────────────────────
function Ar() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">شروط الاستخدام</h1>
      <p className="text-gray-400 text-xs mb-8">آخر تحديث: يوليو 2026</p>
      <S heading="1. نبذة عنا">
        <p>تُشغّل BebKey («الشركة»، «نحن») موقع <strong>bebkey.com</strong>، وهو منصة عقارية لإدارة الإعلانات ووكلاء العقارات في السوق الإسرائيلي.</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>الاسم التجاري:</strong> BebKey</li>
          <li><strong>البريد الإلكتروني:</strong> <EM /></li>
          <li><strong>الولاية القضائية:</strong> دولة إسرائيل</li>
        </ul>
        <p className="mt-2">باستخدامكم BebKey فإنكم تؤكدون أنكم قد قرأتم وفهمتم ووافقتم على هذه الشروط.</p>
      </S>
      <S heading="2. وصف الخدمة">
        <p>توفر BebKey البحث عن العقارات ونشر الإعلانات وتنبيهات مطابقة العملاء ولوحة تحكم الوكلاء وخطط اشتراك مدفوعة لسوق العقارات الإسرائيلي.</p>
      </S>
      <S heading="3. شروط الأهلية">
        <p>يجب أن يكون عمركم <strong>18 عامًا</strong> على الأقل للتسجيل. لنشر الإعلانات أو استخدام الميزات المدفوعة، يُشترط الحصول على رخصة وساطة عقارية إسرائيلية سارية (قانون وسطاء العقارات 5756-1996). البحث العام متاح لجميع المستخدمين.</p>
      </S>
      <S heading="4. الاشتراكات والتجديد التلقائي">
        <p>تُفوتر الخطط المدفوعة شهريًا وتُجدَّد <strong>تلقائيًا</strong> ما لم يتم إلغاؤها قبل تاريخ التجديد. ستتلقون رسالة تذكيرية قبل كل تجديد.</p>
        <p className="mt-2">تتم معالجة المدفوعات عبر <strong>Lemon Squeezy Inc.</strong>، بوصفها التاجر المسجَّل (Merchant of Record). بالاشتراك، تأذنون لـ Lemon Squeezy بتحصيل رسوم دورية من وسيلة دفعكم. تُصدر Lemon Squeezy <strong>فاتورة ضريبية (חשבונית מס)</strong> شاملةً ضريبة القيمة المضافة الإسرائيلية (18% حاليًا)؛ وعند الموافقة على الاسترداد يُصدَر <strong>إشعار دائن (חשבונית זיכוי)</strong>. راجعوا <RefundLink label="سياسة الاسترداد" /> للتفاصيل.</p>
        <p className="mt-2">يُبلَّغ بأي تغييرات في الأسعار قبل <strong>30 يومًا</strong> على الأقل. الاستمرار في الاستخدام يُعدّ قبولًا.</p>
      </S>
      <S heading="5. حق الإلغاء — قانون حماية المستهلك الإسرائيلي" highlight>
        <p className="font-medium text-gray-800">وفقًا لقانون حماية المستهلك 5741-1981 ولوائح إلغاء المعاملة 5771-2010:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-3">
          <li><strong>فترة تبريد 14 يومًا:</strong> يمكنكم إلغاء اشتراككم خلال 14 يومًا من تاريخ الشراء حتى لو بدأتم باستخدام الخدمة.</li>
          <li><strong>سقف رسوم الإلغاء:</strong> يجوز لنا احتجاز ما لا يزيد عن <strong>5% من سعر الاشتراك أو ₪100</strong> أيهما أقل. لا تُطبَّق أي رسوم إذا لم تبدأ الخدمة بعد.</li>
          <li><strong>بعد 14 يومًا:</strong> يمكنكم الإلغاء في أي وقت؛ لن تكون هناك رسوم إضافية بعد انتهاء فترة الفوترة الحالية. راجعوا <RefundLink label="سياسة الاسترداد" /> الخاصة بنا.</li>
          <li><strong>طريقة الإلغاء:</strong> أرسلوا بريدًا إلكترونيًا إلى <EM /> أو استخدموا خيار «إدارة الاشتراك» في صفحة ملفكم الشخصي.</li>
        </ul>
      </S>
      <S heading="6. الاستخدام المقبول">
        <p>توافقون على عدم:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-1">
          <li>جمع بيانات الإعلانات بشكل مجمّع دون إذن خطي</li>
          <li>إنشاء إعلانات كاذبة أو مضللة أو مكررة</li>
          <li>انتحال صفة مستخدمين آخرين أو موظفي BebKey</li>
          <li>استخدام المنصة للبريد العشوائي أو التصيد الاحتيالي أو التسويق غير المرغوب</li>
          <li>التحايل على قيود الوصول المرتبطة بالاشتراك</li>
          <li>انتهاك أي قانون إسرائيلي أو دولي معمول به</li>
        </ul>
      </S>
      <S heading="7. الملكية الفكرية">
        <p>جميع المحتويات والشعارات والكود والتصميم هي ملكية حصرية لـ BebKey أو مانحي التراخيص لها. تحتفظون بملكية المحتوى الذي تحملونه وتمنحون BebKey ترخيصًا غير حصري لعرضه على المنصة.</p>
      </S>
      <S heading="8. طبيعة المنصة — لوحة تجميع معلومات فحسب" highlight>
        <p className="font-semibold text-gray-800 mb-3">هام: يُرجى قراءة هذا البند بعناية قبل استخدام BebKey.</p>
        <p>تعمل BebKey حصرًا بوصفها <strong>منصة تقنية لتجميع البيانات ولوحة معلومات</strong>. نقوم بجمع وعرض بيانات العقارات من مصادر خارجية متاحة للعموم — مواقع إلكترونية وقواعد بيانات وواجهات برمجية (API). نحن لسنا وسيط عقاري أو وكالة أو مستشارًا أو وسيطًا من أي نوع.</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-3">
          <li><strong>انعدام التحقق من الإعلانات:</strong> لا تقوم BebKey بإنشاء أي بيانات إعلانية أو التحقق منها أو مراجعتها أو تأكيدها بصورة مستقلة. جميع البيانات مقدَّمة "كما جُمعت" من مصادر خارجية وقد تكون منقوصة أو قديمة أو غير دقيقة أو لم تعد متاحة.</li>
          <li><strong>انعدام المشاركة في المعاملات:</strong> ليس لـ BebKey أي تدخل من أي نوع في أي صفقة عقارية أو تفاوض أو عرض أو اتفاق أو عقد بين أي مشترٍ أو مستأجر أو بائع أو مالك عقار أو وكيل. جميع هذه التعاملات تجري حصرًا بين الأطراف المعنية مباشرةً.</li>
          <li><strong>انعدام خدمات الوساطة:</strong> لا يُشكّل أي شيء على هذه المنصة وساطةً أو استشارةً قانونية أو مالية أو استثمارية أو مهنية في مجال العقارات. يتعين عليكم التوجه إلى متخصصين مستقلين مؤهلين قبل اتخاذ أي قرار يتعلق بالعقارات.</li>
          <li><strong>تحمّل المخاطر:</strong> تُقرّون وتوافقون على أنكم تعتمدون على أي معلومات معروضة على BebKey على مسؤوليتكم الكاملة. تتبرأ BebKey صراحةً من أي مسؤولية ناشئة عن الاعتماد على أي بيانات إعلانية أو أسعار أو توافر أو أوصاف تظهر على المنصة.</li>
          <li><strong>مصادر خارجية:</strong> تصدر بيانات الإعلانات من مصادر خارجية لا تمارس BebKey أي سيطرة تحريرية عليها. لا تُقدّم BebKey أي ضمانات بشأن دقة هذه البيانات أو اكتمالها أو حداثتها أو موثوقيتها.</li>
          <li><strong>العناية الواجبة:</strong> تقع على عاتقكم وحدكم مسؤولية التحقق المستقل من جميع تفاصيل الإعلان وإجراء العناية الواجبة المناسبة والتشاور مع متخصصين مؤهلين قبل الدخول في أي معاملة عقارية.</li>
        </ul>
      </S>
      <S heading="9. تحديد المسؤولية">
        <p>تُقدَّم BebKey «كما هي» و«بحسب التوافر»، دون أي ضمان من أي نوع، صريحًا كان أم ضمنيًا. في أقصى الحدود التي يجيزها القانون المعمول به، لن تتحمل BebKey ومديروها وموظفوها والشركات المرتبطة بها أي مسؤولية عن أي أضرار مباشرة أو غير مباشرة أو عَرَضية أو خاصة أو تبعية أو عقابية تنشأ عن استخدامكم للمنصة أو عجزكم عن استخدامها.</p>
        <p className="mt-2">لا تتجاوز مسؤوليتنا الإجمالية عن أي مطالبة المبلغ الذي دفعتموه لنا خلال <strong>الأشهر الثلاثة</strong> السابقة للمطالبة، أو ₪100 — أيهما أقل.</p>
      </S>
      <S heading="10. الخصوصية">
        <p>يخضع استخدامكم لـ BebKey لـ<PrivacyLink label="سياسة الخصوصية" /> الخاصة بنا، والتي تمتثل لقانون حماية الخصوصية 5741-1981 والتعديل رقم 13 (نافذ اعتبارًا من 14 أغسطس 2025).</p>
      </S>
      <S heading="11. إنهاء الخدمة">
        <p>يجوز لنا تعليق أو إنهاء حسابكم في حال انتهاك هذه الشروط. يمكنكم إغلاق الحساب في أي وقت بالتواصل معنا.</p>
      </S>
      <S heading="12. التغييرات على الشروط">
        <p>يُبلَّغ عن التغييرات الجوهرية عبر البريد الإلكتروني و/أو إشعار بارز على الموقع قبل <strong>14 يومًا</strong> على الأقل من نفاذها. الاستمرار في الاستخدام يُعدّ قبولًا.</p>
      </S>
      <S heading="13. القانون الحاكم وتسوية النزاعات">
        <p>تخضع هذه الشروط لقوانين <strong>دولة إسرائيل</strong>. تُحسم النزاعات في المحاكم المختصة في <strong>تل أبيب-يافا، إسرائيل</strong>.</p>
      </S>
      <S heading="14. التواصل">
        <p>أسئلة؟ <EM /></p>
      </S>
    </>
  )
}

// ── French ───────────────────────────────────────────────────────────────────
function Fr() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Conditions d'utilisation</h1>
      <p className="text-gray-400 text-xs mb-8">Dernière mise à jour : juillet 2026</p>
      <S heading="1. À propos de nous">
        <p>BebKey («la Société», «nous») exploite le site <strong>bebkey.com</strong>, une plateforme d'annonces immobilières et de gestion d'agents pour le marché israélien.</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li><strong>Nom commercial :</strong> BebKey</li>
          <li><strong>E-mail :</strong> <EM /></li>
          <li><strong>Juridiction :</strong> État d'Israël</li>
        </ul>
        <p className="mt-2">En utilisant BebKey, vous confirmez avoir lu, compris et accepté les présentes Conditions.</p>
      </S>
      <S heading="2. Description du service">
        <p>BebKey propose la recherche de biens immobiliers, la publication d'annonces, des alertes de correspondance client, un tableau de bord pour agents et des formules d'abonnement payantes pour le marché immobilier israélien.</p>
      </S>
      <S heading="3. Conditions d'éligibilité">
        <p>Vous devez avoir au moins <strong>18 ans</strong> pour créer un compte. Pour publier des annonces ou utiliser les fonctionnalités payantes, vous devez détenir une licence de courtage immobilier israélienne valide (Loi sur les agents immobiliers 5756-1996). La recherche générale est accessible à tous.</p>
      </S>
      <S heading="4. Abonnements et renouvellement automatique">
        <p>Les formules payantes sont facturées mensuellement et se <strong>renouvellent automatiquement</strong> sauf résiliation avant la date de renouvellement. Vous recevrez un rappel avant chaque renouvellement.</p>
        <p className="mt-2">Les paiements sont traités par <strong>Lemon Squeezy Inc.</strong>, notre Merchant of Record. En vous abonnant, vous autorisez Lemon Squeezy à prélever votre moyen de paiement de manière récurrente. Lemon Squeezy émet une <strong>facture fiscale (חשבונית מס)</strong> TVA israélienne incluse (actuellement 18 %) ; une <strong>note de crédit (חשבונית זיכוי)</strong> est émise pour tout remboursement approuvé. Voir notre <RefundLink label="Politique de remboursement" /> pour les détails.</p>
        <p className="mt-2">Tout changement de tarif est communiqué au moins <strong>30 jours à l'avance</strong>. La poursuite de l'utilisation vaut acceptation.</p>
      </S>
      <S heading="5. Droit de résiliation — Droit de la consommation israélien" highlight>
        <p className="font-medium text-gray-800">Conformément à la Loi sur la protection des consommateurs 5741-1981 et au Règlement sur l'annulation de transaction 5771-2010 :</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-3">
          <li><strong>Délai de rétractation de 14 jours :</strong> vous pouvez résilier dans les 14 jours suivant l'achat, même si vous avez commencé à utiliser le service.</li>
          <li><strong>Plafond des frais d'annulation :</strong> nous pouvons retenir jusqu'à <strong>5 % du prix de l'abonnement ou ₪100</strong>, le montant le plus bas s'appliquant. Aucun frais si le service n'a pas encore démarré.</li>
          <li><strong>Après 14 jours :</strong> résiliation possible à tout moment ; aucun prélèvement supplémentaire après la fin de la période de facturation en cours. Voir notre <RefundLink label="Politique de remboursement" />.</li>
          <li><strong>Comment résilier :</strong> envoyez un e-mail à <EM /> ou utilisez «Gérer l'abonnement» dans votre profil.</li>
        </ul>
      </S>
      <S heading="6. Utilisation acceptable">
        <p>Vous vous engagez à ne pas :</p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-1">
          <li>collecter en masse des données d'annonces sans autorisation écrite</li>
          <li>créer des annonces fausses, trompeuses ou en doublon</li>
          <li>usurper l'identité d'autres utilisateurs ou du personnel BebKey</li>
          <li>utiliser la plateforme à des fins de spam, hameçonnage ou démarchage non sollicité</li>
          <li>contourner les restrictions d'accès liées à l'abonnement</li>
          <li>enfreindre toute loi israélienne ou internationale applicable</li>
        </ul>
      </S>
      <S heading="7. Propriété intellectuelle">
        <p>Tous les contenus, logos, codes et designs sont la propriété exclusive de BebKey ou de ses concédants. Vous conservez la propriété des contenus que vous publiez et accordez à BebKey une licence non exclusive pour les afficher sur la plateforme.</p>
      </S>
      <S heading="8. Nature de la plateforme — tableau de bord d'agrégation uniquement" highlight>
        <p className="font-semibold text-gray-800 mb-3">Important : veuillez lire attentivement cette section avant d'utiliser BebKey.</p>
        <p>BebKey opère exclusivement en tant que <strong>plateforme technologique d'agrégation et tableau de bord d'information</strong>. Nous collectons et affichons des données immobilières provenant de sources tierces accessibles au public — sites web, bases de données et API. Nous ne sommes pas un courtier immobilier, une agence, un conseiller ou un intermédiaire de quelque nature que ce soit.</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-3">
          <li><strong>Absence de vérification des annonces :</strong> BebKey ne crée, ne vérifie, ne valide ni ne confirme de manière indépendante aucune donnée d'annonce. Toutes les informations sont fournies «telles qu'agrégées» depuis des sources externes et peuvent être incomplètes, obsolètes, inexactes ou ne plus être disponibles.</li>
          <li><strong>Absence de participation aux transactions :</strong> BebKey n'est impliquée d'aucune manière dans aucune transaction immobilière, négociation, offre, accord ou contrat entre acheteurs, locataires, vendeurs, propriétaires ou agents. Toutes ces démarches s'effectuent exclusivement et directement entre les parties concernées.</li>
          <li><strong>Absence de services de courtage :</strong> rien sur cette plateforme ne constitue un service de courtage, un conseil juridique, financier, d'investissement ou professionnel en matière immobilière. Vous devez consulter des professionnels qualifiés indépendants avant toute décision relative à un bien immobilier.</li>
          <li><strong>Acceptation des risques :</strong> vous reconnaissez et acceptez que vous vous fiez à toute information affichée sur BebKey entièrement à vos propres risques. BebKey décline expressément toute responsabilité découlant de votre confiance dans les données d'annonces, prix, disponibilités ou descriptions présentés sur la plateforme.</li>
          <li><strong>Sources tierces :</strong> les données d'annonces proviennent de sources tierces sur lesquelles BebKey n'exerce aucun contrôle éditorial. BebKey ne fait aucune déclaration quant à l'exactitude, l'exhaustivité, l'actualité ou la fiabilité de ces données.</li>
          <li><strong>Diligence raisonnable :</strong> il vous appartient de vérifier indépendamment tous les détails des annonces, de procéder aux vérifications appropriées et de consulter des professionnels qualifiés avant de conclure toute transaction immobilière.</li>
        </ul>
      </S>
      <S heading="9. Limitation de responsabilité">
        <p>BebKey est fourni «tel quel» et «selon disponibilité», sans garantie d'aucune sorte, expresse ou implicite. Dans toute la mesure permise par le droit applicable, BebKey, ses dirigeants, employés et sociétés affiliées ne sauraient être tenus responsables de tout dommage direct, indirect, accessoire, spécial, consécutif ou punitif découlant de votre utilisation ou de votre impossibilité d'utiliser la plateforme.</p>
        <p className="mt-2">Notre responsabilité totale pour toute réclamation ne saurait dépasser le montant que vous nous avez versé au cours des <strong>trois mois</strong> précédant la réclamation, ou ₪100, selon le montant le moins élevé.</p>
      </S>
      <S heading="10. Confidentialité">
        <p>Votre utilisation de BebKey est soumise à notre <PrivacyLink label="Politique de confidentialité" />, conforme à la Loi sur la protection de la vie privée 5741-1981 et à l'Amendement n°13 (en vigueur depuis le 14 août 2025).</p>
      </S>
      <S heading="11. Résiliation">
        <p>Nous pouvons suspendre ou résilier votre compte en cas de violation des présentes Conditions. Vous pouvez fermer votre compte à tout moment en nous contactant.</p>
      </S>
      <S heading="12. Modifications des Conditions">
        <p>Les changements substantiels sont communiqués par e-mail et/ou par un avis visible sur le site au moins <strong>14 jours</strong> avant leur entrée en vigueur. La poursuite de l'utilisation vaut acceptation.</p>
      </S>
      <S heading="13. Droit applicable et litiges">
        <p>Les présentes Conditions sont régies par le droit de l'<strong>État d'Israël</strong>. Tout litige relève de la compétence exclusive des tribunaux de <strong>Tel Aviv-Jaffa, Israël</strong>.</p>
      </S>
      <S heading="14. Contact">
        <p>Questions ? <EM /></p>
      </S>
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Terms() {
  useSeo({
    title: 'Terms of Service',
    description: 'Terms governing your use of BebKey — buyers, sellers, agents, and visitors.',
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

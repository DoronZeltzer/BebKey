import { useTranslation } from 'react-i18next'
import { useSeo } from '../hooks/useSeo'

const EM = () => (
  <a href="mailto:support@bebkey.com" className="text-brand-blue underline">
    support@bebkey.com
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
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Accessibility Statement</h1>
      <p className="text-gray-400 text-xs mb-2">Last updated: May 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        Published in accordance with the{' '}
        <strong>Equal Rights for Persons with Disabilities Law, 5758-1998</strong> and the{' '}
        <strong>Accessibility Regulations (Service Adjustments), 5773-2013</strong>.
      </p>
      <S heading="About BebKey">
        <p>
          BebKey (<strong>bebkey.com</strong>) is a real estate listing and agent-management
          platform for the Israeli property market. We believe access to housing information is a
          right and are committed to making our site accessible to everyone, including people with
          disabilities.
        </p>
      </S>
      <S heading="Conformance Level" highlight>
        <p>
          BebKey aims to conform to <strong>Israeli Standard IS 5568 (ת&quot;י 5568)</strong>,
          based on <strong>WCAG 2.1 Level AA</strong>. The site is currently in{' '}
          <strong>partial conformance</strong>. We are actively working to close remaining gaps.
        </p>
      </S>
      <S heading="Accessibility Adjustments Implemented">
        <ul className="list-disc list-inside space-y-2 text-gray-600">
          <li><strong>Semantic HTML</strong> - correct heading hierarchy, landmark elements, and list markup.</li>
          <li><strong>Keyboard navigation</strong> - all interactive elements are reachable by keyboard alone.</li>
          <li><strong>Focus indicators</strong> - visible focus rings on all interactive elements.</li>
          <li><strong>Colour contrast</strong> - meets WCAG AA (4.5:1 for normal text, 3:1 for large text).</li>
          <li><strong>Resizable text</strong> - layout remains intact at 200% browser zoom.</li>
          <li><strong>Alternative text</strong> - meaningful images have descriptive <code>alt</code> attributes.</li>
          <li><strong>Form labels</strong> - all inputs have associated labels; required fields are clearly marked.</li>
          <li><strong>Error identification</strong> - validation errors are described in text.</li>
          <li><strong>ARIA attributes</strong> - used where native HTML semantics are insufficient.</li>
          <li><strong>Language declaration</strong> - <code>lang</code> attribute set to support screen readers.</li>
          <li><strong>No auto-playing media</strong> - no auto-play audio or video.</li>
          <li><strong>No flashing content</strong> - no content flashes more than 3 times per second.</li>
          <li><strong>Responsive design</strong> - fully usable on mobile devices and all screen sizes.</li>
        </ul>
      </S>
      <S heading="Known Limitations">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>Agent-uploaded images may not always include descriptive alt text.</li>
          <li>Some complex filter controls may have reduced screen-reader support.</li>
          <li>Linked PDF documents (if any) may not be fully accessible.</li>
        </ul>
      </S>
      <S heading="Compatible Assistive Technologies">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>NVDA + Firefox (Windows)</li>
          <li>JAWS + Chrome (Windows)</li>
          <li>VoiceOver + Safari (macOS / iOS)</li>
          <li>TalkBack + Chrome (Android)</li>
          <li>Keyboard-only navigation (all major browsers)</li>
          <li>High-contrast / dark mode OS settings</li>
          <li>Browser zoom up to 200%</li>
        </ul>
      </S>
      <S heading="Contact - Accessibility Requests & Feedback" highlight>
        <p className="mb-2">
          Encountered a barrier or need content in an alternative format? Contact us:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Email:</strong> <EM /> - subject: <em>"Accessibility"</em></li>
          <li><strong>Response time:</strong> within <strong>5 business days</strong>.</li>
        </ul>
        <p className="mt-3 text-xs text-gray-600">
          If your request is not resolved, you may contact the{' '}
          <a href="https://www.gov.il/en/departments/the_equality_of_rights_for_people_with_disabilities_commission" target="_blank" rel="noopener noreferrer" className="text-brand-blue underline">
            Israeli Equal Rights Commission for Persons with Disabilities
          </a>.
        </p>
      </S>
      <S heading="Statement Review Date">
        <p>Last reviewed and updated: <strong>May 2026</strong>.</p>
      </S>
    </>
  )
}

// ── Hebrew ───────────────────────────────────────────────────────────────────
function He() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">הצהרת נגישות</h1>
      <p className="text-gray-400 text-xs mb-2">עודכן לאחרונה: מאי 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        הצהרה זו מתפרסמת בהתאם ל<strong>חוק שוויון זכויות לאנשים עם מוגבלות, תשנ"ח-1998</strong>{' '}
        ול<strong>תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), תשע"ג-2013</strong>.
      </p>
      <S heading="אודות BebKey">
        <p>
          BebKey (<strong>bebkey.com</strong>) היא פלטפורמת נדל"ן לניהול מודעות ותיווך בשוק
          הישראלי. אנו מאמינים כי גישה למידע על דיור היא זכות, ומחויבים להנגשת האתר לכלל
          המשתמשים, לרבות אנשים עם מוגבלות.
        </p>
      </S>
      <S heading="רמת תאימות" highlight>
        <p>
          BebKey שואפת לעמוד ב<strong>תקן ישראלי ת"י 5568</strong>, המבוסס על{' '}
          <strong>WCAG 2.1 ברמה AA</strong>. האתר נמצא כיום ב
          <strong>תאימות חלקית</strong> - אנו פועלים באופן שוטף לסגירת הפערים הנותרים.
        </p>
      </S>
      <S heading="התאמות נגישות שבוצעו">
        <ul className="list-disc list-inside space-y-2 text-gray-600">
          <li><strong>HTML סמנטי</strong> - היררכיית כותרות נכונה, אלמנטים ציוניים ורשימות מובנות.</li>
          <li><strong>ניווט במקלדת</strong> - כל אלמנטי האינטראקציה נגישים דרך המקלדת בלבד.</li>
          <li><strong>מחוון פוקוס</strong> - טבעת פוקוס גלויה על כל אלמנט אינטראקטיבי.</li>
          <li><strong>ניגודיות צבעים</strong> - עומדת בדרישות WCAG AA (4.5:1 לטקסט רגיל, 3:1 לטקסט גדול).</li>
          <li><strong>שינוי גודל טקסט</strong> - הפריסה נשמרת גם בהגדלה של 200% בדפדפן.</li>
          <li><strong>טקסט חלופי</strong> - תמונות משמעותיות כוללות תיאור <code>alt</code>.</li>
          <li><strong>תוויות טפסים</strong> - כל שדה קשור לתווית; שדות חובה מסומנים בבירור.</li>
          <li><strong>זיהוי שגיאות</strong> - שגיאות אימות מתוארות בטקסט.</li>
          <li><strong>תכונות ARIA</strong> - בשימוש כשהסמנטיקה של HTML אינה מספיקה.</li>
          <li><strong>הצהרת שפה</strong> - תכונת <code>lang</code> מוגדרת לתמיכה בקוראי מסך.</li>
          <li><strong>ללא מדיה אוטומטית</strong> - האתר אינו מפעיל אודיו או וידאו אוטומטית.</li>
          <li><strong>ללא תוכן מהבהב</strong> - אין תוכן המהבהב יותר מ-3 פעמים בשנייה.</li>
          <li><strong>עיצוב רספונסיבי</strong> - ניתן לשימוש מלא במכשירים ניידים ובכל גדלי המסך.</li>
        </ul>
      </S>
      <S heading="מגבלות ידועות">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>תמונות שמועלות על-ידי מתווכים לא תמיד כוללות טקסט חלופי מתאר.</li>
          <li>חלק ממסנני החיפוש המורכבים עשויים לקבל תמיכה חלקית בקוראי מסך.</li>
          <li>מסמכי PDF המקושרים מהאתר (אם קיימים) עשויים שלא להיות נגישים במלואם.</li>
        </ul>
      </S>
      <S heading="טכנולוגיות עזר נתמכות">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>NVDA + Firefox (Windows)</li>
          <li>JAWS + Chrome (Windows)</li>
          <li>VoiceOver + Safari (macOS / iOS)</li>
          <li>TalkBack + Chrome (Android)</li>
          <li>ניווט במקלדת בלבד (כל הדפדפנים המרכזיים)</li>
          <li>הגדרות ניגודיות גבוהה / מצב כהה במערכת ההפעלה</li>
          <li>הגדלת דפדפן עד 200%</li>
        </ul>
      </S>
      <S heading="יצירת קשר - פניות ומשוב נגישות" highlight>
        <p className="mb-2">
          נתקלתם במחסום נגישות או זקוקים לתוכן בפורמט חלופי? צרו איתנו קשר:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>אימייל:</strong> <EM /> - נושא: <em>"נגישות"</em></li>
          <li><strong>זמן תגובה:</strong> עד <strong>5 ימי עסקים</strong>.</li>
        </ul>
        <p className="mt-3 text-xs text-gray-600">
          אם פנייתכם לא טופלה כראוי, ניתן לפנות ל
          <a href="https://www.gov.il/he/departments/the_equality_of_rights_for_people_with_disabilities_commission" target="_blank" rel="noopener noreferrer" className="text-brand-blue underline mx-1">
            נציבות שוויון זכויות לאנשים עם מוגבלות
          </a>.
        </p>
      </S>
      <S heading="תאריך בדיקת ההצהרה">
        <p>הצהרה זו נבדקה ועודכנה לאחרונה ב<strong>מאי 2026</strong>.</p>
      </S>
    </>
  )
}

// ── Russian ──────────────────────────────────────────────────────────────────
function Ru() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Заявление о доступности</h1>
      <p className="text-gray-400 text-xs mb-2">Последнее обновление: май 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        Публикуется в соответствии с{' '}
        <strong>Законом о равных правах лиц с ограниченными возможностями, 5758-1998</strong>{' '}
        и <strong>Положением о доступности услуг, 5773-2013</strong> (израильское законодательство).
      </p>
      <S heading="О платформе BebKey">
        <p>
          BebKey (<strong>bebkey.com</strong>) - платформа для поиска недвижимости и управления
          агентами на израильском рынке. Мы убеждены, что доступ к информации о жилье является
          правом каждого, и стремимся обеспечить доступность нашего сайта для всех пользователей,
          включая людей с ограниченными возможностями.
        </p>
      </S>
      <S heading="Уровень соответствия" highlight>
        <p>
          BebKey стремится соответствовать <strong>израильскому стандарту IS 5568 (ת"י 5568)</strong>,
          основанному на <strong>WCAG 2.1 уровень AA</strong>. Сайт находится в состоянии{' '}
          <strong>частичного соответствия</strong> - мы активно работаем над устранением имеющихся
          недостатков.
        </p>
      </S>
      <S heading="Реализованные меры доступности">
        <ul className="list-disc list-inside space-y-2 text-gray-600">
          <li><strong>Семантический HTML</strong> - правильная иерархия заголовков, ориентиры и списки.</li>
          <li><strong>Клавиатурная навигация</strong> - все интерактивные элементы доступны с клавиатуры.</li>
          <li><strong>Индикаторы фокуса</strong> - видимое кольцо фокуса на всех интерактивных элементах.</li>
          <li><strong>Контрастность цветов</strong> - соответствует WCAG AA (4,5:1 для обычного текста).</li>
          <li><strong>Масштабирование текста</strong> - макет сохраняется при увеличении браузера до 200%.</li>
          <li><strong>Альтернативный текст</strong> - значимые изображения имеют описание <code>alt</code>.</li>
          <li><strong>Метки форм</strong> - все поля ввода связаны с метками; обязательные поля отмечены.</li>
          <li><strong>Идентификация ошибок</strong> - ошибки валидации описаны текстом.</li>
          <li><strong>Атрибуты ARIA</strong> - используются при недостаточной семантике HTML.</li>
          <li><strong>Объявление языка</strong> - атрибут <code>lang</code> задан для поддержки экранных дикторов.</li>
          <li><strong>Без автовоспроизведения</strong> - сайт не воспроизводит аудио или видео автоматически.</li>
          <li><strong>Без мигающего контента</strong> - отсутствует контент, мигающий более 3 раз в секунду.</li>
          <li><strong>Адаптивный дизайн</strong> - полностью работает на мобильных устройствах.</li>
        </ul>
      </S>
      <S heading="Известные ограничения">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>Изображения объектов, загружаемые агентами, не всегда содержат описание alt.</li>
          <li>Некоторые сложные фильтры поиска могут иметь ограниченную поддержку экранных дикторов.</li>
          <li>PDF-документы, ссылки на которые есть на сайте, могут быть не полностью доступны.</li>
        </ul>
      </S>
      <S heading="Поддерживаемые вспомогательные технологии">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>NVDA + Firefox (Windows)</li>
          <li>JAWS + Chrome (Windows)</li>
          <li>VoiceOver + Safari (macOS / iOS)</li>
          <li>TalkBack + Chrome (Android)</li>
          <li>Навигация только с клавиатуры (все основные браузеры)</li>
          <li>Режим высокой контрастности / тёмный режим ОС</li>
          <li>Увеличение браузера до 200%</li>
        </ul>
      </S>
      <S heading="Контакты - запросы и обратная связь по доступности" highlight>
        <p className="mb-2">
          Столкнулись с барьером доступности или нуждаетесь в контенте в альтернативном формате?
          Свяжитесь с нами:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Email:</strong> <EM /> - тема: <em>«Доступность»</em></li>
          <li><strong>Время ответа:</strong> в течение <strong>5 рабочих дней</strong>.</li>
        </ul>
        <p className="mt-3 text-xs text-gray-600">
          Если ваш запрос не был рассмотрен надлежащим образом, вы можете обратиться в{' '}
          <a href="https://www.gov.il/en/departments/the_equality_of_rights_for_people_with_disabilities_commission" target="_blank" rel="noopener noreferrer" className="text-brand-blue underline">
            Израильскую комиссию по равным правам лиц с ограниченными возможностями
          </a>.
        </p>
      </S>
      <S heading="Дата проверки заявления">
        <p>Заявление последний раз проверено и обновлено в <strong>мае 2026 года</strong>.</p>
      </S>
    </>
  )
}

// ── Arabic ───────────────────────────────────────────────────────────────────
function Ar() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">بيان إمكانية الوصول</h1>
      <p className="text-gray-400 text-xs mb-2">آخر تحديث: مايو 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        يُنشر هذا البيان وفقًا لـ<strong>قانون المساواة في حقوق الأشخاص ذوي الإعاقة، 5758-1998</strong>{' '}
        و<strong>لوائح إمكانية الوصول إلى الخدمات، 5773-2013</strong> (التشريع الإسرائيلي).
      </p>
      <S heading="نبذة عن BebKey">
        <p>
          BebKey (<strong>bebkey.com</strong>) منصة عقارية لإدارة الإعلانات ووكلاء العقارات في
          السوق الإسرائيلي. نؤمن بأن الوصول إلى معلومات السكن حق لكل شخص، ونلتزم بجعل موقعنا
          متاحًا للجميع، بما في ذلك الأشخاص ذوو الإعاقة.
        </p>
      </S>
      <S heading="مستوى التوافق" highlight>
        <p>
          تسعى BebKey إلى الامتثال للمعيار الإسرائيلي <strong>IS 5568 (ת"י 5568)</strong>،
          المستند إلى <strong>WCAG 2.1 المستوى AA</strong>. يتمتع الموقع حاليًا بـ
          <strong>توافق جزئي</strong> - ونعمل باستمرار على سد الثغرات المتبقية.
        </p>
      </S>
      <S heading="تعديلات إمكانية الوصول المُنفَّذة">
        <ul className="list-disc list-inside space-y-2 text-gray-600">
          <li><strong>HTML دلالي</strong> - تسلسل صحيح للعناوين وعناصر المعالم والقوائم.</li>
          <li><strong>التنقل بلوحة المفاتيح</strong> - جميع العناصر التفاعلية قابلة للوصول بلوحة المفاتيح.</li>
          <li><strong>مؤشرات التركيز</strong> - حلقة تركيز مرئية على جميع العناصر التفاعلية.</li>
          <li><strong>تباين الألوان</strong> - يستوفي معيار WCAG AA (4.5:1 للنص العادي).</li>
          <li><strong>تغيير حجم النص</strong> - يبقى التصميم سليمًا عند تكبير المتصفح 200%.</li>
          <li><strong>النص البديل</strong> - الصور ذات المعنى تحتوي على وصف <code>alt</code>.</li>
          <li><strong>تسميات النماذج</strong> - جميع الحقول مرتبطة بتسميات؛ الحقول الإلزامية مُحددة بوضوح.</li>
          <li><strong>تحديد الأخطاء</strong> - أخطاء التحقق موصوفة بالنص.</li>
          <li><strong>خصائص ARIA</strong> - تُستخدم عند عدم كفاية دلالات HTML.</li>
          <li><strong>إعلان اللغة</strong> - يُحدد الخاصية <code>lang</code> لدعم قارئات الشاشة.</li>
          <li><strong>لا تشغيل تلقائي</strong> - الموقع لا يُشغّل صوتًا أو فيديو تلقائيًا.</li>
          <li><strong>لا محتوى وامض</strong> - لا يحتوي الموقع على محتوى يومض أكثر من 3 مرات في الثانية.</li>
          <li><strong>تصميم متجاوب</strong> - قابل للاستخدام الكامل على الأجهزة المحمولة.</li>
        </ul>
      </S>
      <S heading="القيود المعروفة">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>الصور التي يرفعها الوكلاء قد لا تتضمن دائمًا نصًا بديلًا وصفيًا.</li>
          <li>بعض عناصر التصفية المعقدة قد تحظى بدعم محدود لقارئات الشاشة.</li>
          <li>مستندات PDF المرتبطة بالموقع (إن وجدت) قد لا تكون متاحة بالكامل.</li>
        </ul>
      </S>
      <S heading="التقنيات المساعدة المدعومة">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>NVDA + Firefox (Windows)</li>
          <li>JAWS + Chrome (Windows)</li>
          <li>VoiceOver + Safari (macOS / iOS)</li>
          <li>TalkBack + Chrome (Android)</li>
          <li>التنقل بلوحة المفاتيح فقط (جميع المتصفحات الرئيسية)</li>
          <li>إعدادات التباين العالي / الوضع الداكن لنظام التشغيل</li>
          <li>تكبير المتصفح حتى 200%</li>
        </ul>
      </S>
      <S heading="التواصل - طلبات إمكانية الوصول والملاحظات" highlight>
        <p className="mb-2">
          هل واجهتم عائقًا في الوصول أو تحتاجون إلى المحتوى بتنسيق بديل؟ تواصلوا معنا:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>البريد الإلكتروني:</strong> <EM /> - الموضوع: <em>«إمكانية الوصول»</em></li>
          <li><strong>وقت الرد:</strong> خلال <strong>5 أيام عمل</strong>.</li>
        </ul>
        <p className="mt-3 text-xs text-gray-600">
          إذا لم يُعالَج طلبكم بشكل مُرضٍ، يمكنكم التواصل مع{' '}
          <a href="https://www.gov.il/en/departments/the_equality_of_rights_for_people_with_disabilities_commission" target="_blank" rel="noopener noreferrer" className="text-brand-blue underline">
            مفوضية المساواة في حقوق الأشخاص ذوي الإعاقة في إسرائيل
          </a>.
        </p>
      </S>
      <S heading="تاريخ مراجعة البيان">
        <p>تمت مراجعة بيان إمكانية الوصول هذا وتحديثه آخر مرة في <strong>مايو 2026</strong>.</p>
      </S>
    </>
  )
}

// ── French ───────────────────────────────────────────────────────────────────
function Fr() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Déclaration d'accessibilité</h1>
      <p className="text-gray-400 text-xs mb-2">Dernière mise à jour : mai 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        Publiée conformément à la{' '}
        <strong>Loi sur l'égalité des droits des personnes handicapées, 5758-1998</strong> et au{' '}
        <strong>Règlement sur l'accessibilité des services, 5773-2013</strong> (législation israélienne).
      </p>
      <S heading="À propos de BebKey">
        <p>
          BebKey (<strong>bebkey.com</strong>) est une plateforme d'annonces immobilières et de
          gestion d'agents pour le marché immobilier israélien. Nous estimons que l'accès à
          l'information sur le logement est un droit et nous nous engageons à rendre notre site
          accessible à tous, y compris aux personnes handicapées.
        </p>
      </S>
      <S heading="Niveau de conformité" highlight>
        <p>
          BebKey vise la conformité à la <strong>norme israélienne IS 5568 (ת"י 5568)</strong>,
          basée sur <strong>WCAG 2.1 niveau AA</strong>. Le site est actuellement en{' '}
          <strong>conformité partielle</strong> - nous travaillons activement à combler les lacunes
          restantes.
        </p>
      </S>
      <S heading="Mesures d'accessibilité mises en œuvre">
        <ul className="list-disc list-inside space-y-2 text-gray-600">
          <li><strong>HTML sémantique</strong> - hiérarchie des titres correcte, éléments repères et listes.</li>
          <li><strong>Navigation au clavier</strong> - tous les éléments interactifs sont accessibles au clavier.</li>
          <li><strong>Indicateurs de focus</strong> - anneau de focus visible sur tous les éléments interactifs.</li>
          <li><strong>Contraste des couleurs</strong> - conforme WCAG AA (4,5:1 pour le texte normal).</li>
          <li><strong>Redimensionnement du texte</strong> - la mise en page reste intacte à 200% de zoom.</li>
          <li><strong>Texte alternatif</strong> - les images significatives ont un attribut <code>alt</code> descriptif.</li>
          <li><strong>Étiquettes de formulaire</strong> - tous les champs ont des étiquettes associées.</li>
          <li><strong>Identification des erreurs</strong> - les erreurs de validation sont décrites par du texte.</li>
          <li><strong>Attributs ARIA</strong> - utilisés quand la sémantique HTML native est insuffisante.</li>
          <li><strong>Déclaration de langue</strong> - l'attribut <code>lang</code> est défini pour les lecteurs d'écran.</li>
          <li><strong>Pas de lecture automatique</strong> - aucun audio ni vidéo ne se lance automatiquement.</li>
          <li><strong>Pas de contenu clignotant</strong> - aucun contenu ne clignote plus de 3 fois par seconde.</li>
          <li><strong>Design responsive</strong> - pleinement utilisable sur appareils mobiles et toutes tailles d'écran.</li>
        </ul>
      </S>
      <S heading="Limitations connues">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>Les images téléversées par les agents peuvent ne pas toujours inclure un texte alt descriptif.</li>
          <li>Certains filtres complexes peuvent avoir un support limité avec les lecteurs d'écran.</li>
          <li>Les documents PDF liés depuis le site (le cas échéant) peuvent ne pas être entièrement accessibles.</li>
        </ul>
      </S>
      <S heading="Technologies d'assistance compatibles">
        <ul className="list-disc list-inside space-y-1 text-gray-600">
          <li>NVDA + Firefox (Windows)</li>
          <li>JAWS + Chrome (Windows)</li>
          <li>VoiceOver + Safari (macOS / iOS)</li>
          <li>TalkBack + Chrome (Android)</li>
          <li>Navigation clavier uniquement (tous les navigateurs principaux)</li>
          <li>Paramètres de contraste élevé / mode sombre du système</li>
          <li>Zoom navigateur jusqu'à 200%</li>
        </ul>
      </S>
      <S heading="Contact - Demandes d'accessibilité et commentaires" highlight>
        <p className="mb-2">
          Vous avez rencontré un obstacle ou besoin de contenu dans un format alternatif ? Contactez-nous :
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>E-mail :</strong> <EM /> - objet : <em>« Accessibilité »</em></li>
          <li><strong>Délai de réponse :</strong> dans les <strong>5 jours ouvrables</strong>.</li>
        </ul>
        <p className="mt-3 text-xs text-gray-600">
          Si votre demande n'est pas traitée de manière satisfaisante, vous pouvez contacter la{' '}
          <a href="https://www.gov.il/en/departments/the_equality_of_rights_for_people_with_disabilities_commission" target="_blank" rel="noopener noreferrer" className="text-brand-blue underline">
            Commission israélienne pour l'égalité des droits des personnes handicapées
          </a>.
        </p>
      </S>
      <S heading="Date de révision de la déclaration">
        <p>Cette déclaration a été révisée et mise à jour pour la dernière fois en <strong>mai 2026</strong>.</p>
      </S>
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Accessibility() {
  useSeo({
    title: 'Accessibility Statement',
    description: "BebKey's accessibility commitment under Israeli Standard IS 5568 and WCAG 2.1 AA, including known limitations and contact channels.",
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

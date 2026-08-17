import { useTranslation } from 'react-i18next'
import { useSeo } from '../hooks/useSeo'

const EM = () => (
  <a href="mailto:support@bebkey.com" className="text-brand-blue underline">support@bebkey.com</a>
)

const S = ({ heading, highlight, children }: { heading: string; highlight?: boolean; children: React.ReactNode }) => (
  <section className={`mb-6${highlight ? ' border border-blue-100 rounded-xl p-4 bg-blue-50' : ''}`}>
    <h2 className="text-lg font-semibold text-gray-800 mb-2">{heading}</h2>
    {children}
  </section>
)

const CPA = ({ label }: { label: string }) => (
  <a
    href="https://www.gov.il/en/departments/consumer_protection_and_fair_trade"
    target="_blank"
    rel="noopener noreferrer"
    className="text-brand-blue underline"
  >
    {label}
  </a>
)

function En() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Refund &amp; Cancellation Policy</h1>
      <p className="text-gray-400 text-xs mb-2">Last updated: July 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        This policy is issued in accordance with the <strong>Consumer Protection Law, 5741-1981</strong> and
        the <strong>Consumer Protection Regulations (Cancellation of Transaction), 5771-2010</strong>.
      </p>

      <S heading="Your Statutory Right to Cancel" highlight>
        <p className="font-medium text-gray-800 mb-3">
          Under Israeli law you have the right to cancel your subscription within{' '}
          <strong>14 days</strong> from the date of the transaction (or from the date you received
          these written terms, whichever is later) — even if you have already started using the service.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Cancellation fee:</strong> We may deduct a fee of no more than{' '}
            <strong>5% of the subscription price or ₪100, whichever is lower</strong>.
            No fee if the service has not yet started.
          </li>
          <li>
            <strong>Refund timing:</strong> Approved refunds are returned within{' '}
            <strong>7 business days</strong> of receiving your cancellation request.
          </li>
          <li>
            <strong>How to cancel:</strong> Email <EM /> with the subject "Cancellation Request"
            and your registered account email, or use <strong>Profile → Manage Subscription</strong>.
          </li>
        </ul>
      </S>

      <S heading="30-Day Satisfaction Guarantee (Beyond Legal Minimum)">
        <p>
          In addition to your statutory rights, we offer a <strong>30-day money-back guarantee</strong>.
          If you are not satisfied with BebKey for any reason within the first 30 days, contact us and we
          will issue a <strong>full refund with no cancellation fee</strong> — no questions asked.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          This voluntary guarantee does not limit your rights under Israeli consumer law.
        </p>
      </S>

      <S heading="After 30 Days">
        <p>
          After the 30-day guarantee period, subscriptions are generally non-refundable for the current
          billing cycle. You may <strong>cancel at any time</strong> to stop future charges — access
          continues until the end of the paid period.
        </p>
        <p className="mt-2">
          We review hardship requests case by case. Email <EM /> with the details.
        </p>
      </S>

      <S heading="Automatic Renewal Reminder">
        <p>
          Your subscription renews automatically each month. We will send a reminder before each renewal.
          To avoid being charged for the next period, cancel <strong>before</strong> the renewal date.
        </p>
      </S>

      <S heading="How to Cancel">
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-1">
          <li>Go to <strong>Profile &amp; Settings → Manage Subscription</strong> and follow the steps.</li>
          <li>Email <EM /> with your registered account email.</li>
        </ul>
        <p className="mt-2">Cancellation takes effect at the end of the current billing cycle.</p>
      </S>

      <S heading="Refund Method &amp; Processing Time">
        <p>
          Refunds are returned via <strong>Lemon Squeezy</strong> to the original payment method. Processing time
          after approval:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li>Credit / debit card: up to <strong>7 business days</strong></li>
          <li>Bank transfer (where applicable): up to <strong>7 business days</strong></li>
        </ul>
      </S>

      <S heading="Tax Invoices &amp; Credit Notes">
        <p>
          Payments are billed by <strong>Lemon Squeezy Inc.</strong> as our Merchant of Record for the
          Israeli market. Lemon Squeezy issues a <strong>tax invoice (חשבונית מס)</strong> for each
          transaction, inclusive of Israeli VAT (currently 18%). When a refund is approved, a matching{' '}
          <strong>credit note (חשבונית זיכוי)</strong> is issued dated to the tax period in which the
          refund is processed — which may fall in a different tax year than the original charge. Billing
          records are retained for 7 years in accordance with Israeli tax law.
        </p>
      </S>

      <S heading="Exceptions">
        <p>
          We may deny a refund if an account materially violated our{' '}
          <a href="/terms" className="text-brand-blue underline">Terms of Service</a> (e.g. fraudulent
          activity, false listings). This does not affect your statutory 14-day right.
        </p>
      </S>

      <S heading="Contact">
        <p>Refund or cancellation requests: <EM /></p>
        <p className="mt-1 text-xs text-gray-500">
          You may also contact the{' '}
          <CPA label="Israeli Consumer Protection and Fair Trade Authority" />.
        </p>
      </S>
    </>
  )
}

function He() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">מדיניות החזרים וביטולים</h1>
      <p className="text-gray-400 text-xs mb-2">עודכן לאחרונה: יולי 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        מדיניות זו ניתנת בהתאם ל<strong>חוק הגנת הצרכן, תשמ"א-1981</strong> ול
        <strong>תקנות הגנת הצרכן (ביטול עסקה), תשע"א-2010</strong>.
      </p>

      <S heading="זכות הביטול החוקית שלך" highlight>
        <p className="font-medium text-gray-800 mb-3">
          על פי חוק הגנת הצרכן, יש לך זכות לבטל את המנוי תוך{' '}
          <strong>14 ימים</strong> ממועד העסקה (או ממועד קבלת תנאים אלו בכתב, המאוחר מביניהם) -
          גם אם כבר התחלת להשתמש בשירות.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>דמי ביטול:</strong> נוכה דמי ביטול של עד <strong>5% ממחיר המנוי או 100 ₪, הנמוך מביניהם</strong>.
            לא ייגבו דמי ביטול אם השירות טרם החל.
          </li>
          <li>
            <strong>מועד החזר:</strong> החזר שאושר יועבר לאמצעי התשלום המקורי תוך{' '}
            <strong>7 ימי עסקים</strong> מקבלת בקשת הביטול.
          </li>
          <li>
            <strong>כיצד לבטל:</strong> שלחו מייל ל-<EM /> עם הכותרת "בקשת ביטול" וכתובת המייל שנרשמה,
            או השתמשו ב-<strong>פרופיל ← ניהול מנוי</strong>.
          </li>
        </ul>
      </S>

      <S heading="אחריות שביעות רצון של 30 יום (מעבר לחוק)">
        <p>
          בנוסף לזכויותיך החוקיות, אנו מציעים <strong>אחריות להחזר כספי מלא של 30 יום</strong>.
          אם אינך מרוצה מ-BebKey מכל סיבה שהיא בתוך 30 הימים הראשונים — פנה אלינו ונבצע{' '}
          <strong>החזר מלא ללא דמי ביטול</strong>, ללא שאלות.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          ערבות זו רחבה מהמינימום החוקי ואינה מגבילה את זכויותיך על פי חוק הגנת הצרכן.
        </p>
      </S>

      <S heading="לאחר 30 יום">
        <p>
          לאחר תקופת האחריות של 30 הימים, המנויים אינם ניתנים להחזר בדרך כלל עבור מחזור החיוב הנוכחי.
          עם זאת, ניתן <strong>לבטל בכל עת</strong> להפסקת חיובים עתידיים — הגישה נמשכת עד סוף התקופה ששולמה.
        </p>
        <p className="mt-2">
          אנו בוחנים בקשות מיוחדות בכל מקרה לגופו. שלח מייל ל-<EM /> עם הפרטים.
        </p>
      </S>

      <S heading="תזכורת חידוש אוטומטי">
        <p>
          המנוי שלך מתחדש אוטומטית מדי חודש. נשלח תזכורת לפני כל חידוש.
          לביטול לפני החיוב הבא, יש לבטל <strong>לפני</strong> תאריך החידוש.
        </p>
      </S>

      <S heading="כיצד לבטל">
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-1">
          <li>עבור ל-<strong>פרופיל והגדרות ← ניהול מנוי</strong> ופעל לפי השלבים.</li>
          <li>שלח מייל ל-<EM /> עם כתובת המייל הרשומה.</li>
        </ul>
        <p className="mt-2">הביטול ייכנס לתוקף בסוף מחזור החיוב הנוכחי.</p>
      </S>

      <S heading="שיטת החזר ולוח זמנים">
        <p>
          החזרים יועברו דרך <strong>Lemon Squeezy</strong> לאמצעי התשלום המקורי. זמן עיבוד לאחר אישור:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li>כרטיס אשראי/חיוב: עד <strong>7 ימי עסקים</strong></li>
          <li>העברה בנקאית (כשרלוונטי): עד <strong>7 ימי עסקים</strong></li>
        </ul>
      </S>

      <S heading="חשבוניות מס וחשבוניות זיכוי">
        <p>
          התשלומים מחויבים על-ידי <strong>Lemon Squeezy Inc.</strong> כ-Merchant of Record שלנו לשוק הישראלי.
          Lemon Squeezy מנפיקה <strong>חשבונית מס</strong> עבור כל עסקה, כולל מע"מ ישראלי (כיום 18%).
          כאשר מאושר החזר, מונפקת <strong>חשבונית זיכוי</strong> מקבילה, המתוארכת לתקופת המס בה מבוצע ההחזר -
          תקופה שעשויה ליפול בשנת מס שונה מזו של החיוב המקורי. רשומות החיוב נשמרות למשך 7 שנים בהתאם לחוק המס הישראלי.
        </p>
      </S>

      <S heading="חריגים">
        <p>
          אנו שומרים לעצמנו את הזכות לסרב להחזר אם חשבון הפר באופן מהותי את{' '}
          <a href="/terms" className="text-brand-blue underline">תנאי השימוש</a>{' '}
          (לדוגמה: פעילות הונאה, רישומים כוזבים). חריג זה אינו פוגע בזכות הביטול החוקית של 14 הימים.
        </p>
      </S>

      <S heading="יצירת קשר">
        <p>בקשות להחזר או ביטול: <EM /></p>
        <p className="mt-1 text-xs text-gray-500">
          ניתן גם לפנות ל<CPA label="הרשות להגנת הצרכן ולסחר הוגן" />.
        </p>
      </S>
    </>
  )
}

function Ru() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Политика возврата и отмены</h1>
      <p className="text-gray-400 text-xs mb-2">Последнее обновление: июль 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        Настоящая политика составлена в соответствии с <strong>Законом о защите потребителей Израиля
        (5741-1981)</strong> и <strong>Правилами о защите потребителей (отмена сделки), 5771-2010</strong>.
      </p>

      <S heading="Ваше законное право на отмену" highlight>
        <p className="font-medium text-gray-800 mb-3">
          По израильскому законодательству вы вправе отменить подписку в течение{' '}
          <strong>14 дней</strong> с даты транзакции (или с даты получения настоящих условий в
          письменной форме, в зависимости от того, что наступит позже) — даже если вы уже начали
          пользоваться сервисом.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Сбор за отмену:</strong> Мы можем удержать не более{' '}
            <strong>5% стоимости подписки или 100 ₪ — в зависимости от того, что меньше</strong>.
            Плата не взимается, если услуга ещё не была запущена.
          </li>
          <li>
            <strong>Сроки возврата:</strong> Одобренные возвраты поступают на исходный способ оплаты
            в течение <strong>7 рабочих дней</strong> с момента получения запроса.
          </li>
          <li>
            <strong>Как отменить:</strong> Напишите на <EM /> с темой «Запрос на отмену» и
            email вашего аккаунта, или воспользуйтесь разделом{' '}
            <strong>Профиль → Управление подпиской</strong>.
          </li>
        </ul>
      </S>

      <S heading="30-дневная гарантия удовлетворённости (сверх законного минимума)">
        <p>
          Помимо законных прав, мы предлагаем <strong>30-дневную гарантию возврата денег</strong>.
          Если вы по любой причине не удовлетворены BebKey в первые 30 дней платной подписки -
          свяжитесь с нами и мы оформим <strong>полный возврат без штрафа</strong> — без лишних вопросов.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Эта добровольная гарантия шире законного минимума и не ограничивает ваши права.
        </p>
      </S>

      <S heading="После 30 дней">
        <p>
          По истечении 30-дневного периода гарантии подписки, как правило, не подлежат возврату
          за текущий расчётный период. Тем не менее вы можете <strong>отменить в любое время</strong>,
          чтобы остановить будущие списания — доступ сохраняется до конца оплаченного периода.
        </p>
        <p className="mt-2">
          Мы рассматриваем индивидуальные обращения. Напишите на <EM /> с подробностями.
        </p>
      </S>

      <S heading="Напоминание об автопродлении">
        <p>
          Ваша подписка автоматически продлевается каждый месяц. Мы отправим напоминание перед
          каждым продлением. Чтобы не быть списанным за следующий период, отмените подписку{' '}
          <strong>до</strong> даты продления.
        </p>
      </S>

      <S heading="Как отменить">
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-1">
          <li>Перейдите в <strong>Профиль и настройки → Управление подпиской</strong> и следуйте инструкциям.</li>
          <li>Напишите на <EM /> с email вашего аккаунта.</li>
        </ul>
        <p className="mt-2">Отмена вступает в силу в конце текущего расчётного цикла.</p>
      </S>

      <S heading="Способ и сроки возврата средств">
        <p>
          Возвраты осуществляются через <strong>Lemon Squeezy</strong> на исходный способ оплаты.
          Время обработки после одобрения:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li>Кредитная / дебетовая карта: до <strong>7 рабочих дней</strong></li>
          <li>Банковский перевод (где применимо): до <strong>7 рабочих дней</strong></li>
        </ul>
      </S>

      <S heading="Налоговые счета и кредит-ноты">
        <p>
          Платежи выставляются компанией <strong>Lemon Squeezy Inc.</strong> в качестве нашего Merchant of Record
          для израильского рынка. Lemon Squeezy выставляет <strong>налоговый счёт (חשבונית מס)</strong> на каждую
          транзакцию, включая израильский НДС (в настоящее время 18%). При одобрении возврата выставляется
          соответствующая <strong>кредит-нота (חשבונית זיכוי)</strong>, датированная налоговым периодом,
          в котором обрабатывается возврат — и этот период может относиться к другому налоговому году,
          нежели исходное списание. Записи хранятся 7 лет в соответствии с израильским налоговым законодательством.
        </p>
      </S>

      <S heading="Исключения">
        <p>
          Мы оставляем за собой право отказать в возврате, если аккаунт нарушил{' '}
          <a href="/terms" className="text-brand-blue underline">Условия использования</a>{' '}
          (например: мошенничество, ложные объявления). Это исключение не влияет на ваше законное
          14-дневное право.
        </p>
      </S>

      <S heading="Контакты">
        <p>Запросы на возврат или отмену: <EM /></p>
        <p className="mt-1 text-xs text-gray-500">
          Вы также можете обратиться в{' '}
          <CPA label="Израильское управление по защите прав потребителей" />.
        </p>
      </S>
    </>
  )
}

function Ar() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">سياسة الاسترداد والإلغاء</h1>
      <p className="text-gray-400 text-xs mb-2">آخر تحديث: يوليو 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        تُصدر هذه السياسة وفقاً <strong>لقانون حماية المستهلك الإسرائيلي (5741-1981)</strong>{' '}
        ولوائح حماية المستهلك (إلغاء الصفقة)، 5771-2010.
      </p>

      <S heading="حقك القانوني في الإلغاء" highlight>
        <p className="font-medium text-gray-800 mb-3">
          بموجب القانون الإسرائيلي، يحق لك إلغاء اشتراكك خلال{' '}
          <strong>14 يوماً</strong> من تاريخ المعاملة (أو من تاريخ استلامك هذه الشروط كتابةً،
          أيهما أحدث) — حتى لو بدأت بالفعل في استخدام الخدمة.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>رسوم الإلغاء:</strong> قد نخصم رسوماً لا تتجاوز{' '}
            <strong>5% من سعر الاشتراك أو 100 شيكل أيهما أقل</strong>.
            لا تُفرض أي رسوم إذا لم تبدأ الخدمة بعد.
          </li>
          <li>
            <strong>موعد الاسترداد:</strong> تُرسَل المبالغ المستردة إلى وسيلة الدفع الأصلية خلال{' '}
            <strong>7 أيام عمل</strong> من استلام طلب الإلغاء.
          </li>
          <li>
            <strong>كيفية الإلغاء:</strong> أرسل بريداً إلكترونياً إلى <EM /> بعنوان "طلب إلغاء"
            مع البريد الإلكتروني للحساب المسجل، أو استخدم <strong>الملف الشخصي ← إدارة الاشتراك</strong>.
          </li>
        </ul>
      </S>

      <S heading="ضمان الرضا لمدة 30 يوماً (يتجاوز الحد القانوني)">
        <p>
          إضافةً إلى حقوقك القانونية، نقدم <strong>ضمان استرداد المبلغ كاملاً لمدة 30 يوماً</strong>.
          إذا لم تكن راضياً عن BebKey لأي سبب خلال أول 30 يوماً من اشتراكك المدفوع، تواصل معنا
          وسنصدر <strong>استرداداً كاملاً دون رسوم إلغاء</strong> — دون أسئلة.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          هذا الضمان الطوعي أوسع من الحد القانوني الأدنى ولا يقيد حقوقك.
        </p>
      </S>

      <S heading="بعد 30 يوماً">
        <p>
          بعد انتهاء فترة ضمان 30 يوماً، لا تُردّ الاشتراكات عموماً عن دورة الفوترة الحالية.
          ومع ذلك، يمكنك <strong>الإلغاء في أي وقت</strong> لإيقاف الرسوم المستقبلية — يستمر
          الوصول حتى نهاية الفترة المدفوعة.
        </p>
        <p className="mt-2">
          ندرس الطلبات الاستثنائية كل حالة على حدة. أرسل بريداً إلكترونياً إلى <EM /> بالتفاصيل.
        </p>
      </S>

      <S heading="تذكير التجديد التلقائي">
        <p>
          يتجدد اشتراكك تلقائياً كل شهر. سنرسل تذكيراً قبل كل تجديد.
          لتجنب الرسوم على الفترة التالية، يجب إلغاء الاشتراك <strong>قبل</strong> تاريخ التجديد.
        </p>
      </S>

      <S heading="كيفية الإلغاء">
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-1">
          <li>انتقل إلى <strong>الملف الشخصي والإعدادات ← إدارة الاشتراك</strong> واتبع الخطوات.</li>
          <li>أرسل بريداً إلكترونياً إلى <EM /> مع البريد الإلكتروني للحساب.</li>
        </ul>
        <p className="mt-2">يسري الإلغاء في نهاية دورة الفوترة الحالية.</p>
      </S>

      <S heading="طريقة الاسترداد والمعالجة">
        <p>
          تُردّ المبالغ عبر <strong>Lemon Squeezy</strong> إلى وسيلة الدفع الأصلية. مدة المعالجة بعد الموافقة:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li>بطاقة ائتمان / خصم: حتى <strong>7 أيام عمل</strong></li>
          <li>تحويل بنكي (حيث ينطبق): حتى <strong>7 أيام عمل</strong></li>
        </ul>
      </S>

      <S heading="الفواتير الضريبية وإشعارات الدائن">
        <p>
          تُصدَر فواتير المدفوعات عن طريق <strong>Lemon Squeezy Inc.</strong> بوصفها التاجر المسجَّل (Merchant of Record)
          للسوق الإسرائيلي. تُصدر Lemon Squeezy <strong>فاتورة ضريبية (חשבונית מס)</strong> عن كل معاملة،
          شاملةً ضريبة القيمة المضافة الإسرائيلية (18% حاليًا). عند الموافقة على الاسترداد، يُصدَر{' '}
          <strong>إشعار دائن (חשבונית זיכוי)</strong> مطابق مؤرَّخ بالفترة الضريبية التي تتم فيها معالجة الاسترداد -
          وقد تقع في سنة ضريبية مختلفة عن تاريخ الشحن الأصلي. تُحفظ سجلات الفواتير لمدة 7 سنوات وفقًا للقانون
          الضريبي الإسرائيلي.
        </p>
      </S>

      <S heading="الاستثناءات">
        <p>
          نحتفظ بالحق في رفض الاسترداد إذا انتهك الحساب بشكل جوهري{' '}
          <a href="/terms" className="text-brand-blue underline">شروط الاستخدام</a>{' '}
          (مثل: النشاط الاحتيالي، الإعلانات الكاذبة). لا يؤثر هذا الاستثناء على حق الإلغاء القانوني
          لمدة 14 يوماً.
        </p>
      </S>

      <S heading="التواصل">
        <p>طلبات الاسترداد أو الإلغاء: <EM /></p>
        <p className="mt-1 text-xs text-gray-500">
          يمكنك أيضاً التواصل مع{' '}
          <CPA label="هيئة حماية المستهلك والتجارة العادلة الإسرائيلية" />.
        </p>
      </S>
    </>
  )
}

function Fr() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Politique de remboursement et d'annulation</h1>
      <p className="text-gray-400 text-xs mb-2">Dernière mise à jour : juillet 2026</p>
      <p className="text-gray-500 text-xs mb-8">
        Cette politique est émise conformément à la <strong>Loi israélienne sur la protection des
        consommateurs (5741-1981)</strong> et au <strong>Règlement sur la protection des consommateurs
        (annulation de transaction), 5771-2010</strong>.
      </p>

      <S heading="Votre droit légal d'annulation" highlight>
        <p className="font-medium text-gray-800 mb-3">
          En vertu du droit israélien, vous avez le droit d'annuler votre abonnement dans les{' '}
          <strong>14 jours</strong> suivant la date de la transaction (ou à partir de la date de
          réception des présentes conditions écrites, selon ce qui survient en dernier) — même si
          vous avez déjà commencé à utiliser le service.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Frais d'annulation :</strong> Nous pouvons déduire des frais n'excédant pas{' '}
            <strong>5 % du prix de l'abonnement ou 100 ₪, le montant le plus faible</strong>.
            Aucun frais si le service n'a pas encore démarré.
          </li>
          <li>
            <strong>Délai de remboursement :</strong> Les remboursements approuvés sont restitués au
            moyen de paiement d'origine sous <strong>7 jours ouvrables</strong> suivant la réception
            de votre demande.
          </li>
          <li>
            <strong>Comment annuler :</strong> Envoyez un e-mail à <EM /> avec l'objet « Demande
            d'annulation » et votre adresse e-mail de compte, ou utilisez{' '}
            <strong>Profil → Gérer l'abonnement</strong>.
          </li>
        </ul>
      </S>

      <S heading="Garantie de satisfaction de 30 jours (au-delà du minimum légal)">
        <p>
          En plus de vos droits légaux, nous offrons une <strong>garantie de remboursement de 30 jours</strong>.
          Si vous n'êtes pas satisfait de BebKey pour quelque raison que ce soit dans les 30 premiers
          jours de votre abonnement payant, contactez-nous et nous vous accorderons un{' '}
          <strong>remboursement intégral sans frais d'annulation</strong> — sans questions.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Cette garantie volontaire est plus généreuse que le minimum légal et ne limite pas vos droits.
        </p>
      </S>

      <S heading="Après 30 jours">
        <p>
          Au-delà de la période de garantie de 30 jours, les abonnements ne sont généralement pas
          remboursables pour le cycle de facturation en cours. Vous pouvez cependant{' '}
          <strong>annuler à tout moment</strong> pour stopper les prélèvements futurs — l'accès
          se poursuit jusqu'à la fin de la période déjà payée.
        </p>
        <p className="mt-2">
          Nous examinons les demandes exceptionnelles au cas par cas. Écrivez à <EM /> avec les
          détails.
        </p>
      </S>

      <S heading="Rappel de renouvellement automatique">
        <p>
          Votre abonnement se renouvelle automatiquement chaque mois. Nous vous enverrons un rappel
          avant chaque renouvellement. Pour éviter d'être prélevé pour la prochaine période, annulez{' '}
          <strong>avant</strong> la date de renouvellement.
        </p>
      </S>

      <S heading="Comment annuler">
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-1">
          <li>Accédez à <strong>Profil et paramètres → Gérer l'abonnement</strong> et suivez les étapes.</li>
          <li>Envoyez un e-mail à <EM /> avec votre adresse e-mail de compte.</li>
        </ul>
        <p className="mt-2">L'annulation prend effet à la fin du cycle de facturation en cours.</p>
      </S>

      <S heading="Méthode et délai de remboursement">
        <p>
          Les remboursements sont effectués via <strong>Lemon Squeezy</strong> sur le moyen de paiement
          d'origine. Délai de traitement après approbation :
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-600 mt-2">
          <li>Carte de crédit / débit : jusqu'à <strong>7 jours ouvrables</strong></li>
          <li>Virement bancaire (le cas échéant) : jusqu'à <strong>7 jours ouvrables</strong></li>
        </ul>
      </S>

      <S heading="Factures fiscales et notes de crédit">
        <p>
          Les paiements sont facturés par <strong>Lemon Squeezy Inc.</strong> en tant que Merchant of Record
          pour le marché israélien. Lemon Squeezy émet une <strong>facture fiscale (חשבונית מס)</strong>{' '}
          pour chaque transaction, TVA israélienne comprise (actuellement 18 %). Lorsqu'un remboursement
          est approuvé, une <strong>note de crédit (חשבונית זיכוי)</strong> correspondante est émise à la
          date de la période fiscale au cours de laquelle le remboursement est traité — période qui peut
          relever d'une année fiscale différente de celle de la charge initiale. Les registres de facturation
          sont conservés pendant 7 ans conformément au droit fiscal israélien.
        </p>
      </S>

      <S heading="Exceptions">
        <p>
          Nous nous réservons le droit de refuser un remboursement si un compte a enfreint de manière
          substantielle nos{' '}
          <a href="/terms" className="text-brand-blue underline">Conditions d'utilisation</a>{' '}
          (ex. : activité frauduleuse, annonces mensongères). Cette exception n'affecte pas votre
          droit légal d'annulation de 14 jours.
        </p>
      </S>

      <S heading="Contact">
        <p>Demandes de remboursement ou d'annulation : <EM /></p>
        <p className="mt-1 text-xs text-gray-500">
          Vous pouvez également contacter l'
          <CPA label="Autorité israélienne de protection des consommateurs et du commerce équitable" />.
        </p>
      </S>
    </>
  )
}

export default function Refund() {
  useSeo({
    title: 'Refund Policy',
    description: 'Refund and cancellation policy for BebKey subscriptions and one-off listing fees.',
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

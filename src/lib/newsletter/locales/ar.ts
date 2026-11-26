import type { LocaleStrings } from "./strings";

// Arabic renders right-to-left. That is handled by `dir="rtl"` and mirrored
// padding in the renderer (see isRtl), NOT by a separate template — which is
// the point of keeping one template.
//
// Numbers stay Western Arabic numerals (1, 2, 3): they are what U.S. government
// documents use, and a reader cross-checking a figure against the source should
// not have to transliterate it.
const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("ar", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
    numberingSystem: "latn",
  });

export const ar: LocaleStrings = {
  htmlLang: "ar",
  endonym: "العربية",

  subject: (n, coreNews) => {
    if (n === 0) return "أسبوع هادئ: لا تغييرات رسمية جديدة";
    return coreNews.length === 0
      ? `H-1B والبطاقة الخضراء للعمل: لا تغييرات. تحديثات أخرى: ${n}`
      : `جديد في ${ar.joinList(coreNews)}. التحديثات: ${n}`;
  },
  preheader: (n, top) =>
    n === 0
      ? "لم تُسجَّل تغييرات رسمية مهمة هذا الأسبوع."
      : top
        ? `الأبرز: ${top}. كل تحديث مرتبط بمصدره الرسمي.`
        : `${n} من التغييرات الرسمية في الهجرة الأمريكية، كل منها مرتبط بمصدره.`,

  hero: {
    title: (coreNews) =>
      coreNews.length === 0
        ? "لا تغييرات في H-1B أو البطاقة الخضراء عبر العمل هذا الأسبوع"
        : `جديد هذا الأسبوع في ${ar.joinList(coreNews)}`,
    quietWeek: "أسبوع هادئ في أخبار الهجرة الرسمية",
    meta: (n, m) => `${n} من التحديثات الرسمية · مدة القراءة ${m} د`,
  },

  core: { h1b: "H-1B", employmentGreenCard: "البطاقة الخضراء عبر العمل" },
  joinList: (xs) => xs.join(" و"),

  board: {
    title: "المواضيع التي نتابعها",
    noChange: "لا تغيير",
    news: "جديد هذا الأسبوع",
    note:
      "«لا تغيير» يعني أن مصادرنا لم تسجّل شيئاً بشأن هذا الموضوع هذا الأسبوع. هذا وصف لأرشيفنا وليس للعالم كله، " +
      "فتحقّق دائماً من المصدر الرسمي قبل اتخاذ أي إجراء.",
  },

  kind: {
    new_information: "معلومات جديدة",
    updated_information: "تحديث سياسة",
    correction: "تصحيح",
    historical_revision: "مراجعة",
    announcement: "إعلان",
    data_release: "نشر بيانات",
    proposed_rule: "قاعدة مقترحة",
    final_rule: "قاعدة نهائية",
    executive_action: "إجراء تنفيذي",
    court_decision: "قرار قضائي",
    legislative_action: "تشريع",
    deadline: "موعد نهائي",
  },

  cta: {
    kicker: "تنبيهات مجانية",
    title: "تنتظر نشرة التأشيرات (Visa Bulletin)؟",
    body:
      "احصل بالبريد الإلكتروني على التاريخين الخاصين بفئتك وبلدك كلما نُشر شهر جديد من نشرة التأشيرات.",
    button: "فعّل التنبيهات المجانية",
  },

  brand: {
    productName: "ImmigrationClock",
    tagline: "Immigration Pulse",
    strapline: "تغييرات الهجرة الأمريكية الرسمية، من المصادر الحكومية.",
  },

  issueLabel: (from, to) => `أسبوع ${fmt(from)} – ${fmt(to)}`,
  date: (iso) => fmt(iso),

  opening: {
    withChanges: (shown, recorded) =>
      recorded > shown
        ? `شهد هذا الأسبوع ${recorded} من التحديثات الرسمية المتعلقة بالهجرة. وفيما يلي ${shown} من أهمها؛ وبقيتها في الأرشيف.`
        : `شهد هذا الأسبوع ${shown} من التحديثات الرسمية المتعلقة بالهجرة.`,
    noChanges:
      "لم تُسجَّل تغييرات رسمية مهمة هذا الأسبوع. هذا وصف لما نشرته مصادرنا، وليس ضماناً بعدم حدوث شيء. " +
      "فالإشعارات الروتينية ما زالت تُضاف إلى الأرشيف، وسنعود الأسبوع المقبل.",
  },

  sections: {
    snapshot: "الأسبوع في لمحة",
    topChanges: "ما الذي تغيّر هذا الأسبوع",
    unchanged: "ما الذي لم يتغيّر",
    upcoming: "مواعيد قادمة",
    quickNumbers: "بالأرقام",
    explore: "تابع استكشاف ImmigrationClock",
  },

  snapshot: {
    readingTime: (m) => `وقت القراءة التقريبي: ${m} دقائق`,
    none: (label) => `لا يوجد ${label}`,
  },

  unchanged: {
    intro:
      "نراقب هذه المواضيع عن كثب. لم يُسجَّل بشأنها شيء هذا الأسبوع، وهذا وصف لأرشيفنا وليس للعالم كله. " +
      "تحقّق دائماً من المصدر الرسمي قبل اتخاذ أي إجراء.",
    topics: {
      h1b: "قواعد H-1B والحد الأقصى السنوي",
      daca: "برنامج DACA",
      tps: "وضع الحماية المؤقتة (TPS)",
      asylum: "اللجوء وقبول اللاجئين",
      students: "تأشيرات الطلاب F-1",
      employmentGreenCard: "البطاقات الخضراء القائمة على العمل",
    },
    allChanged: "جميع المواضيع التي نتابعها شهدت تغييرات هذا الأسبوع. انظر أعلاه.",
  },

  upcoming: {
    recurring: "متكرر",
    note: "مواعيد نشرتها الجهة نفسها. قد تتغيّر، والرابط هو المرجع.",
  },

  leadGroup: (label) => `أهم تغييرات ${label}`,

  item: {
    severity: { major: "مهم", notable: "جدير بالملاحظة", routine: "روتيني" },
    agency: "الجهة",
    published: "تاريخ النشر",
    scheduled: "مقرر نشره",
    notInForce: "مقترح: غير ساري المفعول",
    whyItMatters: "لماذا هذا مهم",
    readDocument: "اقرأ الوثيقة الرسمية",
    fromDocument: "من النص الرسمي",
    top: "الأبرز",
  },

  stats: {
    uscis_policy: "تحديثات سياسة USCIS",
    executive_actions: "الأوامر التنفيذية والإعلانات الرئاسية",
    federal_register: "وثائق السجل الفيدرالي",
    court_decisions: "قرارات المحاكم",
    dhs_announcements: "إعلانات وزارة الأمن الداخلي",
    total_recorded: "إجمالي التغييرات المسجلة",
    other_changes: "تغييرات أخرى مسجّلة",
  },

  explore: {
    searchVisa: "ابحث عن تأشيرتك",
    latestChanges: "أحدث تغييرات الهجرة",
    processingTimes: "المعالجة والمواعيد المهمة",
    countries: "معلومات حسب الدولة",
    greenCard: "البطاقة الخضراء",
    citizenship: "الجنسية",
    h1b: "H-1B",
  },

  trust: {
    statement:
      "كل تحديث أعلاه يرتبط مباشرةً بالمصدر الحكومي الأصلي. نحن نلخّص معلومات عامة. ولا نقدّم استشارات قانونية إطلاقاً.",
    sourceLanguageNote:
      "عناوين الوثائق وملخصاتها منقولة حرفياً كما نشرتها الحكومة الأمريكية، باللغة الإنجليزية. لا نترجم النص " +
      "الرسمي، لأن الاقتباس المترجم لم يعد اقتباساً.",
  },

  footer: {
    about: "من نحن",
    methodology: "المنهجية",
    sources: "المصادر",
    privacy: "الخصوصية",
    contact: "اتصل بنا",
    unsubscribe: "إلغاء الاشتراك",
    viewOnline: "اقرأ هذا العدد على الويب",
    disclaimer:
      "ينشر ImmigrationClock بيانات حكومية أمريكية عامة. وهو ليس مكتب محاماة ولا يقدّم استشارات قانونية.",
    readIn: "اقرأ بلغة",
  },
};

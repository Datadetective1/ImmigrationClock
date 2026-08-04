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

  subject: (n) =>
    n === 0 ? "Immigration Pulse — أسبوع هادئ" : `Immigration Pulse — ${n} تغييرات`,
  preheader: (n) =>
    n === 0
      ? "لم تُسجَّل تغييرات رسمية مهمة هذا الأسبوع."
      : `${n} من التغييرات الرسمية في الهجرة الأمريكية، كل منها مرتبط بمصدره.`,

  brand: {
    productName: "ImmigrationClock",
    tagline: "Immigration Pulse",
    strapline: "تغييرات الهجرة الأمريكية الرسمية، من المصادر الحكومية.",
  },

  issueLabel: (from, to) => `أسبوع ${fmt(from)} – ${fmt(to)}`,

  opening: {
    withChanges: (n) =>
      `شهد هذا الأسبوع ${n} من التحديثات الرسمية المتعلقة بالهجرة. ` +
      `كل عنصر أدناه يرتبط مباشرةً بالمنشور الحكومي الذي صدر عنه. ` +
      `نحن ننقل ما تغيّر، ولا نخبرك بما يعنيه ذلك لحالتك.`,
    noChanges:
      "لم تُسجَّل تغييرات رسمية مهمة هذا الأسبوع. هذا وصف لما نشرته مصادرنا، وليس ضماناً بعدم حدوث شيء — " +
      "فالإشعارات الروتينية ما زالت تُضاف إلى الأرشيف، وسنعود الأسبوع المقبل.",
  },

  sections: {
    topChanges: "تغييرات هذا الأسبوع",
    quickNumbers: "بالأرقام",
    explore: "تابع استكشاف ImmigrationClock",
  },

  item: {
    severity: { major: "مهم", notable: "جدير بالملاحظة", routine: "روتيني" },
    agency: "الجهة",
    published: "تاريخ النشر",
    scheduled: "مقرر نشره",
    notInForce: "مقترح — غير ساري المفعول",
    whyItMatters: "لماذا هذا مهم",
    readDocument: "اقرأ الوثيقة الرسمية",
  },

  stats: {
    uscis_policy: "تحديثات سياسة USCIS",
    executive_actions: "الأوامر التنفيذية والإعلانات الرئاسية",
    federal_register: "وثائق السجل الفيدرالي",
    court_decisions: "قرارات المحاكم",
    dhs_announcements: "إعلانات وزارة الأمن الداخلي",
    total_recorded: "إجمالي التغييرات المسجلة",
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

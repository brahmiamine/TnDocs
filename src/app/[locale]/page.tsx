import Link from "next/link";
import { notFound } from "next/navigation";

const copy = {
  fr: {
    lang: "fr",
    switchLabel: "العربية",
    nav: ["Catalogue", "Comment ça marche", "À propos"],
    signIn: "Connexion",
    start: "Commencer",
    eyebrow: "Les démarches tunisiennes, simplifiées",
    title: <>Vos documents,<br />enfin <em>sans complication.</em></>,
    intro: "Trouvez le bon modèle, préparez vos informations et créez des documents prêts à utiliser. Un espace clair, pensé pour vos démarches en Tunisie et à l’étranger.",
    explore: "Explorer les modèles",
    how: "Comment ça marche",
    private: "Vos informations personnelles restent privées et sous votre contrôle.",
    sample: "APERÇU DE DOCUMENT",
    letter: "Lettre de procuration",
    sampleSub: "Modèle personnalisable · Français",
    object: "Objet de la demande",
    chipReady: "Prêt à personnaliser",
    chipLang: "Français & arabe",
    categoriesEyebrow: "UN POINT DE DÉPART SIMPLE",
    categoriesTitle: "Trouvez le document qu’il vous faut",
    categoriesIntro: "Parcourez les démarches courantes ou recherchez directement un modèle adapté à votre situation.",
    categories: [["Procurations", "Autorisez une personne à agir pour vous", "↗"], ["Réclamations", "Faites entendre votre demande", "✳"], ["Déclarations", "Formalisez une situation importante", "▤"], ["Travail & logement", "Préparez vos démarches du quotidien", "⌂"]],
    stepsEyebrow: "DU MODÈLE AU DOCUMENT",
    stepsTitle: "Avancez à votre rythme",
    steps: [["Trouvez un modèle", "Parcourez le catalogue et choisissez un document correspondant à votre démarche."], ["Renseignez vos informations", "Suivez les étapes et ajoutez uniquement les informations dont votre document a besoin."], ["Relisez et récupérez", "Vérifiez votre document, puis préparez-le pour l’impression ou la suite de votre démarche."]],
    ctaTitle: "Une démarche à préparer ?",
    ctaText: "Commencez par trouver le bon modèle, en français ou en arabe.",
    cta: "Voir le catalogue",
    footer: "Des outils pour mieux préparer vos démarches.",
    footerLinks: ["Confidentialité", "Contact"],
  },
  ar: {
    lang: "ar",
    switchLabel: "Français",
    nav: ["النماذج", "كيف يعمل", "عن المنصة"],
    signIn: "تسجيل الدخول",
    start: "ابدأ الآن",
    eyebrow: "إجراءاتك التونسية أصبحت أسهل",
    title: <>وثائقك،<br />بكل <em>بساطة.</em></>,
    intro: "اعثر على النموذج المناسب، وأضف معلوماتك، وأنشئ وثائقك بسهولة. مساحة واضحة تساعدك على إعداد إجراءاتك في تونس أو من الخارج.",
    explore: "اكتشف النماذج",
    how: "كيف يعمل",
    private: "تبقى معلوماتك الشخصية خاصة وتحت سيطرتك.",
    sample: "معاينة وثيقة",
    letter: "توكيل",
    sampleSub: "نموذج قابل للتعديل · العربية",
    object: "موضوع الطلب",
    chipReady: "جاهز للتخصيص",
    chipLang: "العربية والفرنسية",
    categoriesEyebrow: "ابدأ بخطوة بسيطة",
    categoriesTitle: "اعثر على الوثيقة المناسبة",
    categoriesIntro: "تصفح الإجراءات الشائعة أو ابحث مباشرة عن نموذج يناسب وضعك.",
    categories: [["التوكيلات", "فوّض شخصاً للقيام بإجراء نيابةً عنك", "↗"], ["الشكاوى", "قدّم طلبك بطريقة واضحة", "✳"], ["التصاريح", "وثّق وضعاً مهماً", "▤"], ["العمل والسكن", "حضّر إجراءات حياتك اليومية", "⌂"]],
    stepsEyebrow: "من النموذج إلى الوثيقة",
    stepsTitle: "تقدّم حسب وتيرتك",
    steps: [["اختر نموذجاً", "تصفح النماذج واختر الوثيقة التي تناسب الإجراء الذي تريد القيام به."], ["أضف معلوماتك", "اتبع الخطوات وأضف المعلومات التي تحتاجها وثيقتك فقط."], ["راجع واحفظ", "راجع وثيقتك ثم حضّرها للطباعة أو لإكمال إجراءاتك."]],
    ctaTitle: "لديك إجراء تريد تحضيره؟",
    ctaText: "ابدأ بالعثور على النموذج المناسب، بالعربية أو الفرنسية.",
    cta: "تصفح النماذج",
    footer: "أدوات تساعدك على إعداد إجراءاتك.",
    footerLinks: ["الخصوصية", "اتصل بنا"],
  },
} as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const t = copy[locale];
  const isArabic = locale === "ar";

  return (
    <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link className="brand" href={`/${locale}`} aria-label="TnDocs, accueil"><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link>
          <nav className="nav-links" aria-label={isArabic ? "التنقل الرئيسي" : "Navigation principale"}>
            {t.nav.map((item, index) => <a key={item} href={index === 1 ? "#how" : "#catalogue"}>{item}</a>)}
          </nav>
          <div className="nav-actions">
            <Link className="locale-switch" href={isArabic ? "/fr" : "/ar"} lang={isArabic ? "fr" : "ar"}>{t.switchLabel}</Link>
            <Link className="login-link" href={`/${locale}/connexion`}>{t.signIn}</Link>
            <Link className="button" href={`/${locale}/catalogue`}>{t.start}</Link>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="container hero-grid">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" />{t.eyebrow}</div>
            <h1>{t.title}</h1>
            <p className="hero-copy">{t.intro}</p>
            <div className="hero-actions">
              <Link className="button" href={`/${locale}/catalogue`}>{t.explore}<span aria-hidden="true">→</span></Link>
              <a className="button button-quiet" href="#how">{t.how}</a>
            </div>
            <div className="trust-note"><span className="trust-icon" aria-hidden="true">✓</span>{t.private}</div>
          </div>
          <div className="preview-wrap" aria-label={isArabic ? "مثال على وثيقة" : "Exemple de document"}>
            <div className="preview-orb" />
            <article className="document-card" aria-hidden="true">
              <div className="doc-topline"><span>{t.sample}</span><span className="doc-seal">✳</span></div>
              <h2 className="doc-title">{t.letter}</h2>
              <div className="doc-subtitle">{t.sampleSub}</div>
              <div className="doc-paragraph" /><div className="doc-paragraph" /><div className="doc-paragraph short" />
              <div className="doc-section">{t.object}</div>
              <div className="doc-fields"><div className="doc-field"><span>{isArabic ? "الاسم الكامل" : "Nom complet"}</span></div><div className="doc-field"><span>{isArabic ? "رقم بطاقة التعريف" : "Numéro d’identité"}</span></div><div className="doc-field"><span>{isArabic ? "العنوان" : "Adresse"}</span></div><div className="doc-field"><span>{isArabic ? "التاريخ" : "Date"}</span></div></div>
              <div className="doc-signature">Signature</div>
            </article>
            <div className="floating-chip one"><span className="chip-icon">✓</span>{t.chipReady}</div>
            <div className="floating-chip two"><span className="chip-icon">文</span>{t.chipLang}</div>
          </div>
        </div>
      </section>

      <section className="section section-white" id="catalogue">
        <div className="container">
          <div className="section-heading"><div className="eyebrow">{t.categoriesEyebrow}</div><h2>{t.categoriesTitle}</h2><p>{t.categoriesIntro}</p></div>
          <div className="category-grid">
            {t.categories.map(([title, description, icon]) => <Link className="category-card" href={`/${locale}/catalogue`} key={title}><span className="category-icon" aria-hidden="true">{icon}</span><h3>{title}</h3><p>{description}</p></Link>)}
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="container">
          <div className="section-heading"><div className="eyebrow">{t.stepsEyebrow}</div><h2>{t.stepsTitle}</h2></div>
          <div className="steps-grid">{t.steps.map(([title, description], index) => <article className="step" key={title}><div className="step-number">0{index + 1}</div><h3>{title}</h3><p>{description}</p></article>)}</div>
        </div>
      </section>

      <section className="section section-white">
        <div className="container"><div className="cta-panel"><div><h2>{t.ctaTitle}</h2><p>{t.ctaText}</p></div><Link className="button" href={`/${locale}/catalogue`}>{t.cta}<span aria-hidden="true">→</span></Link></div></div>
      </section>

      <footer className="footer"><div className="container footer-inner"><span>© {new Date().getFullYear()} TnDocs · {t.footer}</span><div className="footer-links">{t.footerLinks.map((item) => <a href="#" key={item}>{item}</a>)}</div></div></footer>
    </main>
  );
}

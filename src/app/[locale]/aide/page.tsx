import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/modules/community/PageShell';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === 'ar' ? 'المساعدة والأسئلة الشائعة' : 'Aide et questions fréquentes', alternates: { canonical: `/${locale}/aide`, languages: { fr: '/fr/aide', ar: '/ar/aide' } } };
}
export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (locale !== 'fr' && locale !== 'ar') notFound();
  const ar = locale === 'ar';
  const faqs = ar ? [
    ['هل الخدمة حكومية؟', 'لا. TnDocs منصة مستقلة وليست إدارة تونسية. راجع دائمًا المصدر الرسمي والشروط الخاصة بإدارتك أو قنصليتك.'],
    ['هل الخدمة مجانية؟', 'الخدمة مجانية، دون اشتراك أو دفع مقابل التنزيل.'],
    ['كيف أبدأ؟', 'تصفح الكتالوج واختر نموذجًا متاحًا. سجّل الدخول لتخصيصه وحفظه. لا ننشر نماذج رسمية أو ترجمات قبل التحقق.'],
    ['هل الاطلاع على وثائقي متاح للجميع؟', 'وثائقك وملفات أقاربك خاصة. لا تشارك رابطًا خاصًا إلا مع الشخص المقصود، وألغِ المشاركة عند الحاجة.'],
    ['هل صورة التوقيع توقيع معتمد؟', 'لا. إدراج صورة توقيع لا يشكّل توقيعًا إلكترونيًا مؤهلاً ولا يضمن قبول الإدارة للوثيقة.'],
    ['ماذا أفعل عند غياب نموذج أو وجود خطأ؟', 'أرسل اقتراحًا أو بلاغًا. لا تضع رقم الهوية أو وثيقة شخصية أو توقيعًا في المساهمة.'],
    ['ماذا يحدث دون اتصال؟', 'تتاح بعض الصفحات العامة المحفوظة. التخزين المحلي للوثائق الحساسة يحتاج تفعيلًا صريحًا وسرًا محليًا؛ قد يمسحه المتصفح وهو ليس نسخة احتياطية.'],
  ] : [
    ['Est-ce un service gouvernemental ?', 'Non. TnDocs est une plateforme indépendante, sans affiliation à une administration. Vérifiez les sources officielles et les règles de votre administration ou consulat.'],
    ['Le service est-il gratuit ?', 'Oui, sans abonnement ni paiement pour télécharger un document.'],
    ['Comment commencer ?', 'Parcourez le catalogue, puis connectez-vous pour personnaliser et enregistrer un modèle disponible. Aucun original ni traduction ne doit être publié sans vérification.'],
    ['Qui peut consulter mes documents ?', 'Vos documents et les profils autorisés restent privés. Transmettez les liens privés uniquement au destinataire prévu et révoquez-les lorsque nécessaire.'],
    ['Une image de signature est-elle certifiée ?', 'Non. Insérer une image de signature ne constitue pas une signature électronique qualifiée et ne garantit pas l’acceptation du document.'],
    ['Comment proposer un modèle ou signaler une erreur ?', 'Utilisez les contributions. Retirez noms réels, identifiants personnels et signatures ; utilisez des variables comme {{nom}}.'],
    ['Que se passe-t-il sans réseau ?', 'Certaines pages publiques déjà consultées restent accessibles. Le stockage sensible nécessite votre accord et un secret local. Il peut être effacé par le navigateur et ne remplace pas une sauvegarde.'],
  ];
  return <PageShell locale={locale} title={ar ? 'المساعدة والأسئلة الشائعة' : 'Aide et questions fréquentes'}>{faqs.map(([question, answer]) => <details key={question} className="detail-section"><summary><strong>{question}</strong></summary><p>{answer}</p></details>)}<p><Link className="button" href={`/${locale}/contributions`}>{ar ? 'اقتراح أو بلاغ' : 'Proposer ou signaler'}</Link> <Link className="text-link" href={`/${locale}/contact`}>{ar ? 'طلب مساعدة' : 'Demander de l’aide'}</Link></p><p><Link href={`/${locale}/informations`}>{ar ? 'المعلومات القانونية والخصوصية' : 'Informations légales et confidentialité'}</Link></p></PageShell>;
}

import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {userHasRole} from "@/modules/identity/authorization";
import {TaxonomyManager} from "./manager";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function TaxonomyPage({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;if(locale!=="fr"&&locale!=="ar")notFound();const {user,reason}=await userHasRole("admin");if(!user){if(reason==="unauthenticated")redirect(`/${locale}/connexion?returnTo=${encodeURIComponent(`/${locale}/admin/classement`)}`);notFound();}
 const ar=locale==="ar";return <main className="site-shell" dir={ar?"rtl":"ltr"}><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}>TnDocs</Link><Link className="profile-nav-link" href={`/${locale}/admin/catalogue`}>{ar?"إدارة المكتبة":"Administration du catalogue"}</Link></div></header><section className="section"><div className="container"><h1>{ar?"التصنيفات والهيئات":"Catégories et organismes"}</h1><p>{ar?"أنشئ تصنيفاً قبل إضافة أول نموذج. الترجمات اختيارية ولا تُنشأ تلقائياً. تعطيل التصنيف أو الهيئة لا يمسح مراجع النسخ القديمة.":"Créez une catégorie avant votre premier modèle. Les traductions sont facultatives et ne sont jamais inventées. Désactiver une entrée conserve les références des anciennes versions."}</p><TaxonomyManager locale={locale}/></div></section></main>;
}

import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { PrivateTemplatesDashboard } from "./dashboard";
export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function PrivateModelsPage({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;if(locale!=="fr"&&locale!=="ar")notFound();if(!await getCurrentUser())redirect(`/${locale}/connexion`);const ar=locale==="ar";
 return <main className="site-shell" dir={ar?"rtl":"ltr"}><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}>TnDocs</Link><Link className="profile-nav-link" href={`/${locale}/mes-documents`}>{ar?"وثائقي":"Mes documents"}</Link></div></header><section className="section"><div className="container"><h1>{ar?"نماذجي الخاصة":"Mes modèles privés"}</h1><p>{ar?"نماذج قابلة لإعادة الاستخدام ومشفّرة، لا تظهر في المكتبة العامة. تعديل النموذج لا يغيّر الوثائق الموجودة.":"Des modèles réutilisables chiffrés, absents du catalogue public. Modifier un modèle ne change aucun document déjà créé."}</p><PrivateTemplatesDashboard locale={locale}/></div></section></main>;
}

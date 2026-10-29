import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SignatureViewer } from "@/modules/signatures/SignatureViewer";
export const metadata:Metadata={title:"TnDocs · Signature",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function SignPage({params}:{params:Promise<{locale:string}>}){const {locale}=await params;if(locale!=="fr"&&locale!=="ar")notFound();return <main className="container section" dir={locale==="ar"?"rtl":"ltr"}><SignatureViewer locale={locale}/></main>;}

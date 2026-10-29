import {AuthReturn} from "@/modules/identity/AuthReturn";
import { AppNavigation } from "@/modules/navigation/AppNavigation";
import { notFound } from "next/navigation";
import { ServiceWorkerRegistration } from "@/modules/pwa/ServiceWorkerRegistration";
import "../globals.css";

export function generateStaticParams() {
  return [{ locale: "fr" }, { locale: "ar" }];
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();

  return (
    <div lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className={locale === "ar" ? "arabic" : undefined}>
      <ServiceWorkerRegistration />
      <AuthReturn locale={locale} />
      {children}
      <AppNavigation locale={locale} />
    </div>
  );
}

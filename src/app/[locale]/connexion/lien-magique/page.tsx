import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MagicLinkClient } from "./MagicLinkClient";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function MagicLinkPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }> }) {
  const [{ locale }, { token }] = await Promise.all([params, searchParams]);
  if (locale !== "fr" && locale !== "ar") notFound();
  return <MagicLinkClient locale={locale} token={token?.slice(0, 128) ?? ""} />;
}

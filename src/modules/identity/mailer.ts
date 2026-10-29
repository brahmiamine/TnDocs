import nodemailer from "nodemailer";
import { env } from "@/platform/config/env";

export async function sendVerificationEmail(to: string, token: string, locale: "fr" | "ar") {
  if (!env.SMTP_HOST) throw new Error("SMTP is not configured");
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  const link = new URL(`/${locale}/verifier-email`, env.APP_URL);
  link.searchParams.set("token", token);

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: locale === "ar" ? "تأكيد عنوان بريدك الإلكتروني في TnDocs" : "Confirmez votre adresse email TnDocs",
    text: locale === "ar"
      ? `لتأكيد عنوان بريدك الإلكتروني، افتح هذا الرابط خلال 30 دقيقة: ${link.toString()}`
      : `Pour confirmer votre adresse email, ouvrez ce lien sous 30 minutes : ${link.toString()}`,
  });
}

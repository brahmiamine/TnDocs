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

export async function sendPasswordResetEmail(to: string, token: string, locale: "fr" | "ar") {
  if (!env.SMTP_HOST) throw new Error("SMTP is not configured");
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  const link = new URL(`/${locale}/reinitialiser-mot-de-passe`, env.APP_URL);
  link.searchParams.set("token", token);

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: locale === "ar" ? "إعادة تعيين كلمة مرور TnDocs" : "Réinitialisez votre mot de passe TnDocs",
    text: locale === "ar"
      ? `لإنشاء كلمة مرور جديدة، افتح هذا الرابط خلال 30 دقيقة: ${link.toString()}`
      : `Pour choisir un nouveau mot de passe, ouvrez ce lien sous 30 minutes : ${link.toString()}`,
  });
}

export async function sendMagicLinkEmail(to: string, token: string, locale: "fr" | "ar") {
  if (!env.SMTP_HOST) throw new Error("SMTP is not configured");
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  const link = new URL(`/${locale}/connexion/lien-magique`, env.APP_URL);
  link.searchParams.set("token", token);
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: locale === "ar" ? "رابط تسجيل الدخول إلى TnDocs" : "Votre lien de connexion TnDocs",
    text: locale === "ar"
      ? `لتسجيل الدخول إلى TnDocs، افتح الرابط خلال 15 دقيقة. إذا لم تطلب هذا الرابط، فتجاهل هذه الرسالة: ${link.toString()}`
      : `Pour vous connecter à TnDocs, ouvrez ce lien sous 15 minutes. Si vous n’avez pas demandé ce lien, ignorez ce message : ${link.toString()}`,
  });
}

import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import nodemailer, { type SendMailOptions } from "nodemailer";
import { env } from "@/platform/config/env";
import { database } from "@/platform/database/client";
import { users, verificationChallenges } from "@/platform/database/schema";
import { enqueueJob, type JobTransaction } from "@/platform/jobs/queue";
import { emailChangeChallenges } from "./advanced-schema";
import { hashSecretToken } from "./tokens";
import { decryptIdentityMessage, encryptIdentityMessage } from "./mail-crypto";

type Purpose = "email_verification" | "password_reset" | "magic_link" | "email_change";
type IdentityMail = { to: string; token: string; locale: "fr" | "ar"; purpose: Purpose };
async function queueMail(input: IdentityMail, userId: string, tx?: JobTransaction) {
  const scopeId = randomUUID();
  return enqueueJob({ kind: "identity.mail", ownerUserId: userId, key: `identity-mail:${input.purpose}:${hashSecretToken(input.token)}`, payload: { scopeId, messageCiphertext: encryptIdentityMessage(userId, scopeId, input) } }, tx);
}
export function sendVerificationEmail(to: string, token: string, locale: "fr" | "ar", userId: string, tx?: JobTransaction) { return queueMail({ to, token, locale, purpose: "email_verification" }, userId, tx); }
export function sendPasswordResetEmail(to: string, token: string, locale: "fr" | "ar", userId: string, tx?: JobTransaction) { return queueMail({ to, token, locale, purpose: "password_reset" }, userId, tx); }
export function sendMagicLinkEmail(to: string, token: string, locale: "fr" | "ar", userId: string, tx?: JobTransaction) { return queueMail({ to, token, locale, purpose: "magic_link" }, userId, tx); }
export function sendEmailChangeConfirmation(to: string, token: string, locale: "fr" | "ar", userId: string, tx?: JobTransaction) { return queueMail({ to, token, locale, purpose: "email_change" }, userId, tx); }

/** At-least-once delivery with stable Message-ID. No used/expired/revoked account link is sent. */
export async function performIdentityMail(job: { id: string; ownerUserId: string | null; payload: Record<string, unknown> }, deliver?: (message: SendMailOptions) => Promise<unknown>) {
  if (!database || !job.ownerUserId) throw new Error("INVALID_IDENTITY_MAIL");
  const { scopeId, messageCiphertext } = job.payload;
  if (typeof scopeId !== "string" || typeof messageCiphertext !== "string") throw new Error("INVALID_IDENTITY_MAIL");
  const mail = decryptIdentityMessage<IdentityMail>(job.ownerUserId, scopeId, messageCiphertext);
  if (!["email_verification", "password_reset", "magic_link", "email_change"].includes(mail.purpose) || !["fr", "ar"].includes(mail.locale) || typeof mail.token !== "string" || typeof mail.to !== "string") throw new Error("INVALID_IDENTITY_MAIL");
  const [user] = await database.select().from(users).where(eq(users.id, job.ownerUserId)).limit(1);
  if (!user || user.status === "suspended" || mail.purpose === "email_verification" && user.status !== "pending_verification" || mail.purpose !== "email_verification" && user.status !== "active") return { skipped: true };
  if (mail.purpose === "email_change") {
    const [challenge] = await database.select().from(emailChangeChallenges).where(and(eq(emailChangeChallenges.userId, user.id), eq(emailChangeChallenges.tokenHash, hashSecretToken(mail.token)), eq(emailChangeChallenges.newEmail, mail.to), isNull(emailChangeChallenges.usedAt), gt(emailChangeChallenges.expiresAt, new Date()))).limit(1);
    if (!challenge) return { skipped: true };
  } else {
    const [challenge] = await database.select().from(verificationChallenges).where(and(eq(verificationChallenges.userId, user.id), eq(verificationChallenges.tokenHash, hashSecretToken(mail.token)), eq(verificationChallenges.purpose, mail.purpose), isNull(verificationChallenges.usedAt), gt(verificationChallenges.expiresAt, new Date()))).limit(1);
    if (!challenge || mail.to !== user.email) return { skipped: true };
  }
  if (!deliver && !env.SMTP_HOST) throw new Error("SMTP_NOT_CONFIGURED");
  const send = deliver ?? ((message: SendMailOptions) => nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined }).sendMail(message));
  const routes = { email_verification: "verifier-email", password_reset: "reinitialiser-mot-de-passe", magic_link: "connexion-email", email_change: "confirmer-email" };
  const link = new URL(`/${mail.locale}/${routes[mail.purpose]}`, env.APP_URL);
  // Legacy verification/reset pages accept their token as a query; newer flows use a non-referring fragment.
  if (mail.purpose === "email_verification" || mail.purpose === "password_reset") link.searchParams.set("token", mail.token); else link.hash = new URLSearchParams({ token: mail.token }).toString();
  const arabic = mail.locale === "ar", minutes = mail.purpose === "magic_link" ? 15 : 30;
  await send({ from: env.SMTP_FROM, to: mail.to, messageId: `<identity-${job.id}@${new URL(env.APP_URL).hostname}>`, subject: arabic ? "تأكيد طلب حساب TnDocs" : "Confirmez votre demande TnDocs", text: arabic ? `لتأكيد طلبك، افتح الرابط خلال ${minutes} دقيقة. إن لم تطلبه فتجاهله: ${link}` : `Pour confirmer votre demande, ouvrez ce lien sous ${minutes} minutes. Ignorez ce message si vous ne l’avez pas demandé : ${link}` });
  return { delivered: true };
}

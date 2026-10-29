import { z } from 'zod';

// Community text is deliberately plain text: React never interprets it as HTML.
const plainText = (maximum: number) => z.string().trim().min(3).max(maximum)
  .refine(value => !/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value) && !/(?:data|javascript):/iu.test(value), 'Use plain text without embedded images or markup.');
const common = {
  locale: z.enum(['fr', 'ar']), title: plainText(180), body: plainText(5000),
  privacyConfirmed: z.literal(true),
};
export const contributionSchema = z.object({
  ...common, kind: z.enum(['template_request', 'proposal', 'report']),
  sourceUrl: z.string().trim().url().max(2048).refine(value => /^https?:\/\//i.test(value), 'Use an HTTP(S) source URL.').optional(),
}).strict().superRefine((value, ctx) => {
  const content = `${value.title}\n${value.body}`;
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu.test(content) || /\b\d{8,}\b/u.test(content)) {
    ctx.addIssue({ code: 'custom', path: ['body'], message: 'Remove personal email addresses and identity or phone numbers. Use placeholders.' });
  }
});
export const contactSchema = z.object(common).strict();
export const statuses = ['submitted', 'triaged', 'revision_requested', 'accepted', 'rejected', 'closed'] as const;
export type SubmissionStatus = typeof statuses[number];
export const moderationSchema = z.object({
  expectedStatus: z.enum(statuses), status: z.enum(statuses), comment: plainText(2000),
}).strict();
const transitions: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
  submitted: ['triaged'], triaged: ['revision_requested', 'accepted', 'rejected', 'closed'],
  revision_requested: ['submitted', 'rejected', 'closed'], accepted: ['closed'], rejected: [], closed: [],
};
export function canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean { return transitions[from].includes(to); }
export function isPublicPath(path: string): boolean {
  return /^\/(fr|ar)(?:\/(?:catalogue(?:\/[a-zA-Z0-9-]+)?|aide|informations(?:\/(?:confidentialite|conditions|mentions|cookies))?))?\/?$/.test(path);
}

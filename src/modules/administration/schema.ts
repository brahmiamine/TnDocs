import { z } from 'zod';
export const featureFlagsSchema = z.object({ donations: z.boolean(), partnerships: z.boolean(), signatures: z.boolean(), offlineSensitive: z.boolean(), push: z.boolean(), sourceWatch: z.boolean() }).strict();
const externalUrl = z.string().max(2048).refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port && url.hostname.includes('.') && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) && !url.hostname.startsWith('[') && !/(?:^|\.)(?:localhost|local|test|invalid)$/.test(url.hostname); } catch { return false; }
}, 'Use a public HTTPS link without credentials.');
const plain = (max: number) => z.string().trim().min(3).max(max).refine(value => !/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value), 'Plain text is required.');
export const settingsValuesSchema = z.object({
  quotaBytes: z.number().int().positive().max(2147483647),
  featureFlags: featureFlagsSchema,
  donationUrl: externalUrl.nullable(),
  partners: z.array(z.object({ name: plain(120), url: externalUrl, labelFr: plain(180), labelAr: plain(180) }).strict()).max(20),
}).strict();
export const settingsSchema = settingsValuesSchema.extend({ expectedRevision: z.number().int().positive() });
export type SettingsValues = z.infer<typeof settingsValuesSchema>;
export type FeatureFlag = keyof SettingsValues['featureFlags'];
export const defaultSettings: SettingsValues = { quotaBytes: 100 * 1024 * 1024, featureFlags: { donations: false, partnerships: false, signatures: true, offlineSensitive: true, push: true, sourceWatch: false }, donationUrl: null, partners: [] };
export function publicSettings(value: SettingsValues) { return { donationUrl: value.featureFlags.donations ? value.donationUrl : null, partners: value.featureFlags.partnerships ? value.partners : [], features: { signatures: value.featureFlags.signatures, offlineSensitive: value.featureFlags.offlineSensitive, push: value.featureFlags.push, sourceWatch: value.featureFlags.sourceWatch } }; }
export const legalSlugs = ['mentions', 'confidentialite', 'conditions', 'cookies'] as const;
export const legalDraftSchema = z.object({ slug: z.enum(legalSlugs), locale: z.enum(['fr', 'ar']), title: plain(240), body: plain(50_000) }).strict();
export const legalActionSchema = z.object({ action: z.enum(['review', 'publish']), expectedStatus: z.enum(['draft', 'reviewed']), confirmation: z.literal(true) }).strict().refine(value => value.action === 'review' ? value.expectedStatus === 'draft' : value.expectedStatus === 'reviewed');

import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsSchema, legalDraftSchema, legalActionSchema, publicSettings, defaultSettings } from '../src/modules/administration/schema';

test('system settings cannot carry secrets, arbitrary feature names or non-HTTPS donation targets', () => {
  const valid = { ...defaultSettings, expectedRevision: 1 };
  assert.equal(settingsSchema.safeParse(valid).success, true);
  assert.equal(settingsSchema.safeParse({ ...valid, SMTP_PASSWORD: 'secret' }).success, false);
  for (const donationUrl of ['javascript:alert(1)', 'https://127.0.0.1/donate', 'https://internal.local/donate']) assert.equal(settingsSchema.safeParse({ ...valid, donationUrl }).success, false);
  assert.equal(settingsSchema.safeParse({ ...valid, featureFlags: { ...valid.featureFlags, arbitrary: true } }).success, false);
  assert.equal(settingsSchema.safeParse({ ...valid, quotaBytes: 0 }).success, false);
});
test('donations and partners remain absent publicly until enabled with a valid external target', () => {
  assert.equal(publicSettings(defaultSettings).donationUrl, null);
  assert.equal(publicSettings({ ...defaultSettings, donationUrl: 'https://example.org/donate' }).donationUrl, null);
  assert.equal(publicSettings({ ...defaultSettings, donationUrl: 'https://example.org/donate', featureFlags: { ...defaultSettings.featureFlags, donations: true } }).donationUrl, 'https://example.org/donate');
  assert.deepEqual(publicSettings(defaultSettings).partners, []);
  assert.equal('quotaBytes' in publicSettings(defaultSettings), false);
});
test('legal publication requires a separate explicit confirmation and plain reviewed text', () => {
  const draft = { slug: 'mentions', locale: 'fr', title: 'Mentions vérifiées', body: 'Éditeur vérifié par le porteur du projet.' };
  assert.equal(legalDraftSchema.safeParse(draft).success, true);
  assert.equal(legalDraftSchema.safeParse({ ...draft, body: '<script>evil()</script>' }).success, false);
  assert.equal(legalActionSchema.safeParse({ action: 'publish', expectedStatus: 'reviewed', confirmation: false }).success, false);
  assert.equal(legalActionSchema.safeParse({ action: 'publish', expectedStatus: 'reviewed', confirmation: true }).success, true);
});

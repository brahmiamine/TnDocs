import test from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionSchema, preferenceSchema, messageFor, safeNotificationPath } from '../src/modules/notifications/schema';

test('push endpoints accept supported HTTPS providers and reject SSRF destinations', () => {
  const base = { keys: { auth: Buffer.alloc(16, 1).toString('base64url'), p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 2)]).toString('base64url') } };
  assert.equal(subscriptionSchema.safeParse({ ...base, endpoint: 'https://fcm.googleapis.com/fcm/send/token' }).success, true);
  for (const endpoint of ['http://fcm.googleapis.com/send/token', 'https://127.0.0.1/x', 'https://example.test/x', 'https://fcm.googleapis.com.evil.test/x', 'https://user:pass@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x']) {
    assert.equal(subscriptionSchema.safeParse({ ...base, endpoint }).success, false, endpoint);
  }
});
test('notification preferences require explicit push consent and cannot disable security messages', () => {
  assert.equal(preferenceSchema.safeParse({ category: 'document', inApp: true, email: false, push: true, pushConsent: false }).success, false);
  assert.equal(preferenceSchema.safeParse({ category: 'document', inApp: true, email: false, push: true, pushConsent: true }).success, true);
  assert.equal(preferenceSchema.safeParse({ category: 'security', inApp: false, email: false, push: false, pushConsent: false }).success, false);
});
test('notification messages contain only predefined generic copy and links stay inside the account', () => {
  assert.equal(messageFor('document_ready', 'fr').title, 'Votre document est prêt');
  assert.ok(messageFor('document_ready', 'ar').body);
  assert.equal(safeNotificationPath('fr', 'document_ready', '8ed329a4-f95e-4db2-bd6e-087f7b056ce3'), '/fr/mes-documents/8ed329a4-f95e-4db2-bd6e-087f7b056ce3');
  assert.equal(safeNotificationPath('ar', 'document_ready', 'https://evil.test'), '/ar/notifications');
});

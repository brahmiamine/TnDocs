import test from 'node:test';
import assert from 'node:assert/strict';
import { contributionSchema, contactSchema, canTransition, isPublicPath } from '../src/modules/community/schema';

test('catalogue contribution requires privacy confirmation and refuses markup and personal identifiers', () => {
  const valid = { kind: 'proposal', locale: 'fr', title: 'Lettre fictive', body: 'Je soussigné {{nom}} demande {{objet}}.', privacyConfirmed: true };
  assert.equal(contributionSchema.safeParse(valid).success, true);
  assert.equal(contributionSchema.safeParse({ ...valid, privacyConfirmed: false }).success, false);
  for (const body of ['<script>alert(1)</script>', 'Contact : personne@example.test', 'CIN : 01234567', 'data:image/png;base64,abc']) {
    assert.equal(contributionSchema.safeParse({ ...valid, body }).success, false, body);
  }
});
test('support accepts an ordinary report without falsely promising public publication', () => {
  assert.equal(contactSchema.safeParse({ locale: 'ar', title: 'مشكلة تقنية', body: 'تعذر فتح صفحة الكتالوج.', privacyConfirmed: true }).success, true);
  assert.equal(contactSchema.safeParse({ locale: 'fr', title: 'x', body: 'x'.repeat(5001), privacyConfirmed: true }).success, false);
});
test('moderation follows explicit allowed transitions and cannot silently republish an accepted proposal', () => {
  assert.equal(canTransition('submitted', 'triaged'), true);
  assert.equal(canTransition('triaged', 'accepted'), true);
  assert.equal(canTransition('revision_requested', 'submitted'), true);
  assert.equal(canTransition('accepted', 'submitted'), false);
  assert.equal(canTransition('rejected', 'accepted'), false);
  assert.equal(canTransition('submitted', 'accepted'), false);
});
test('private localized pages stay out of public search indexing', () => {
  for (const locale of ['fr', 'ar']) {
    assert.equal(isPublicPath(`/${locale}/catalogue`), true);
    assert.equal(isPublicPath(`/${locale}/aide`), true);
    for (const privatePath of ['profils', 'mes-documents', 'partage', 'admin/catalogue', 'signer', 'contributions', 'contact']) {
      assert.equal(isPublicPath(`/${locale}/${privatePath}`), false);
    }
  }
});

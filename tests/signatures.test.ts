import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { signatureDigest, canonicalJson, canDecide, validateSignaturePng, crc32 } from '../src/modules/signatures/protocol';

test('revision digest canonicalizes object order but binds exact text and revision', () => {
  assert.equal(signatureDigest({ b: 2, a: 'عربي' }, 3), signatureDigest({ a: 'عربي', b: 2 }, 3));
  assert.notEqual(signatureDigest({ a: 'texte' }, 3), signatureDigest({ a: 'texte' }, 4));
  assert.notEqual(signatureDigest({ a: 'texte' }, 3), signatureDigest({ a: 'texte ' }, 3));
  assert.equal(canonicalJson({ z: [2, 1], a: true }), '{"a":true,"z":[2,1]}');
});
test('only verified active participants can decide once on the frozen revision', () => {
  const state = { status: 'viewed', verifiedAt: new Date(), expiresAt: new Date(Date.now()+60000), revokedAt: null, documentStatus: 'draft', expectedHash: 'abc', revisionHash: 'abc' };
  assert.equal(canDecide(state), true);
  for (const patch of [{status:'signed'}, {status:'declined'}, {verifiedAt:null}, {revokedAt:new Date()}, {expiresAt:new Date(0)}, {documentStatus:'trash'}, {revisionHash:'changed'}]) assert.equal(canDecide({...state,...patch}), false);
});
function chunk(type: string, data: Buffer) { const tag = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tag,data]))); return Buffer.concat([length,tag,data,crc]); }
function image(width=1,height=1) { const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4); ihdr[8]=8; ihdr[9]=6; return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.alloc((1+width*4)*height))),chunk('IEND',Buffer.alloc(0))]); }
test('signature image is a decoded bounded PNG, not MIME or header trust', () => {
  const png=image(); assert.deepEqual(validateSignaturePng(png), {width:1,height:1});
  assert.throws(()=>validateSignaturePng(Buffer.from('<svg onload="evil"/>')));
  assert.throws(()=>validateSignaturePng(png.subarray(0,30)));
  const damaged=Buffer.from(png); damaged[damaged.length-1]^=1; assert.throws(()=>validateSignaturePng(damaged));
  assert.throws(()=>validateSignaturePng(Buffer.concat([png, Buffer.from('evil')])));
  assert.throws(()=>validateSignaturePng(image(3000,1)));
});

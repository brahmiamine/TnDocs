import test from 'node:test';import assert from 'node:assert/strict';
import {documentHtml} from '../src/modules/documents/pdf-renderer';
test('PDF HTML escapes text, isolates mixed direction and uses A4',()=>{const html=documentHtml('<script>alert(1)</script>','مرحبا\n<img src="https://private">','ar');assert.ok(html.includes('dir="rtl"'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<img'));assert.ok(html.includes('size:A4'));assert.ok(html.includes('unicode-bidi:plaintext'));});

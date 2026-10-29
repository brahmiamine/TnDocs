import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

test("worker uses public allowlist and never intercepts private or unknown pages", () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    URL, Response,
    self: { location: { origin: "https://tndocs.test" }, addEventListener: (kind: string, listener: (event: unknown) => void) => { listeners[kind] = listener; } },
  });
  for (const path of ["/fr/contact", "/ar/contributions", "/fr/securite", "/ar/notifications", "/fr/signer", "/fr/admin/catalogue", "/fr/mes-documents/doc", "/api/v1/me", "/fr/inconnue", "/fr/catalogue?secret=private", "/fr/connexion", "/ar/partage", "/fr/catalogue/doc"]) {
    let intercepted = false;
    listeners.fetch({ request: { url: `https://tndocs.test${path}`, method: "GET", mode: "navigate" }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, path);
  }
});

test("push content is generic and notification clicks cannot open external or arbitrary pages", async () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  const shown: Array<{ title: string; options: { body: string; data: { url: string } } }> = [];
  const opened: string[] = [];
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    URL, Response,
    self: {
      location: { origin: "https://tndocs.test" },
      addEventListener: (kind: string, listener: (event: unknown) => void) => { listeners[kind] = listener; },
      registration: { showNotification: async (title: string, options: { body: string; data: { url: string } }) => { shown.push({ title, options }); } },
      clients: { openWindow: async (path: string) => { opened.push(path); } },
    },
  });
  let result: Promise<void> | undefined;
  listeners.push({ data: { json: () => ({ title: "CIN privée", body: "corps sensible", url: "https://evil.test" }) }, waitUntil: (value: Promise<void>) => { result = value; } });
  await result;
  assert.equal(shown[0].title, "TnDocs");
  assert.equal(shown[0].options.body.includes("sensible"), false);
  assert.equal(shown[0].options.data.url, "/fr/notifications");
  listeners.notificationclick({ notification: { close() {}, data: { url: "/fr/admin" } }, waitUntil: (value: Promise<void>) => { result = value; } });
  await result;
  assert.equal(opened[0], "/fr/notifications");
  listeners.notificationclick({ notification: { close() {}, data: { url: "/ar/notifications" } }, waitUntil: (value: Promise<void>) => { result = value; } });
  await result;
  assert.equal(opened[1], "/ar/notifications");
});

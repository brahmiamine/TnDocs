import test from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress, validateSourceUrl } from "../src/modules/sources/network-policy";

test("Collector rejects local, metadata, mapped and reserved network addresses", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.2", "192.168.1.1", "169.254.169.254", "100.100.100.200", "0.0.0.0", "224.0.0.1", "192.0.2.1", "198.18.0.1", "::1", "::", "::ffff:127.0.0.1", "fd00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::", "64:ff9b::7f00:1"]) assert.equal(isPublicAddress(address), false, address);
  for (const address of ["8.8.8.8", "1.1.1.1", "2001:4860:4860::8888", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(address), true, address);
});
test("Only exact configured HTTPS hosts without credentials or custom ports are fetched", () => {
  assert.equal(validateSourceUrl("https://www.example.org/path#fragment", ["www.example.org"]).toString(), "https://www.example.org/path");
  for (const url of ["http://www.example.org", "https://evilwww.example.org", "https://www.example.org.evil.test", "https://user:pass@www.example.org", "https://www.example.org:8443", "https://127.0.0.1", "https://[::1]", "https://www.example.org./"]) assert.throws(() => validateSourceUrl(url, ["www.example.org"]), url);
  assert.throws(() => validateSourceUrl("https://www.example.org", []));
});

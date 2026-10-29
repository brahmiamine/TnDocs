import assert from "node:assert/strict";
import test from "node:test";

let parseRevisionPair;
try {
  ({ parseRevisionPair } = await import("./revision-comparison.ts"));
} catch {
  // Keep RED as an assertion failure until the parser is implemented.
}

test("a missing comparison query means no comparison was requested", () => {
  assert.equal(typeof parseRevisionPair, "function", "revision pair parser should be implemented");
  assert.deepEqual(parseRevisionPair(null), { kind: "none" });
});

test("a valid pair preserves the requested left and right order", () => {
  assert.equal(typeof parseRevisionPair, "function", "revision pair parser should be implemented");
  assert.deepEqual(parseRevisionPair("2,5"), { kind: "pair", left: 2, right: 5 });
});

test("malformed and unsafe revision pairs are rejected", () => {
  assert.equal(typeof parseRevisionPair, "function", "revision pair parser should be implemented");
  for (const input of ["", "1", "1,1", "0,2", "2,0", "1.5,2", "2,9007199254740992", "x,2", " 1,2"]) {
    assert.deepEqual(parseRevisionPair(input), { kind: "invalid" }, "expected rejection of " + input);
  }
});

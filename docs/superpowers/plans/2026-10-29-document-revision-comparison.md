# Document Revision Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let an authenticated document owner compare two saved revisions side by side without changing either revision.

**Architecture:** Extend the existing owner-scoped revisions endpoint with a validated comparison query. Decrypt only the two requested revisions and return them with private, no-store headers; the editor presents their title, rendered body, and form answers side by side.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, Node built-in test runner.

**Spec:** User attachment TnDocs-cahier-des-charges-fonctionnel.md, F07: “Versions immuables et datées avec comparaison/restauration”.

## Global Constraints

- Preserve immutable revision records; comparison is read-only.
- Scope every database read to the authenticated document owner.
- Do not include document content in logs, URLs, or cacheable responses.
- Keep French and Arabic labels and respect RTL layout.
- Push commits directly to main, as explicitly requested by the user.

## Review Focus

- A malformed, duplicate, zero, or unsafe revision number must return a client error.
- A revision from another document must never be returned.
- A missing revision must not produce a partial comparison.
- Decryption failure must not expose ciphertext or partial content.
- Unsaved editor content must not be presented as a saved revision comparison.

---

### Task 1: Validate revision pairs

**Files:**
- Create: src/modules/documents/revision-comparison.ts
- Test: src/modules/documents/revision-comparison.test.mjs
- Modify: package.json

**Interfaces:**
- Produces parseRevisionPair(value) returning either a valid ordered pair, none, or invalid.

- [x] Write Node built-in tests for absent, valid, duplicate, malformed, zero, and unsafe revision values.
- [x] Run the focused test and confirm it fails because the parser does not exist.
- [x] Implement the minimal parser.
- [x] Run the focused test and confirm it passes.

### Task 2: Return owner-scoped snapshots

**Files:**
- Modify: src/app/api/v1/me/documents/[documentId]/revisions/route.ts

**Interfaces:**
- Consumes parseRevisionPair.
- Produces a comparison object containing only the two requested saved snapshots.

- [x] Use a valid pair to select revisions belonging to the authorized document.
- [x] Decrypt and return both snapshots in the requested order with no-store headers.
- [x] Return 400 for invalid pairs, 404 if either revision is unavailable, and 503 on decryption failure.
- [x] Run lint and typecheck.

### Task 3: Add the editor comparison view

**Files:**
- Modify: src/app/[locale]/mes-documents/[documentId]/editor.tsx
- Modify: src/app/globals.css

- [x] Add two revision selectors and a compare action in history.
- [x] Disable comparison while unsaved edits exist.
- [x] Show titles, rendered document bodies, and form answer values in two read-only columns.
- [x] Run build, lint, typecheck, and the focused unit test.
- [ ] Commit and push directly to main.

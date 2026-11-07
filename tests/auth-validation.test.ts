import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findDuplicateEmails,
  normalizeEmail,
  validatePassword,
} from "../services/authValidation.js";
import { createEmailIndexIfSafe } from "../scripts/create-user-indexes.js";

test("email normalization trims whitespace and ignores case", () => {
  assert.equal(normalizeEmail("  Person@Example.COM "), "person@example.com");
});

test("password validation accepts the inclusive 12 to 128 character range", () => {
  assert.equal(validatePassword("a".repeat(12)), "a".repeat(12));
  assert.equal(validatePassword("b".repeat(128)), "b".repeat(128));
});

test("password validation rejects wrong types and out-of-range values", () => {
  for (const value of [undefined, 12, "a".repeat(11), "b".repeat(129)]) {
    assert.throws(() => validatePassword(value), /12.*128/);
  }
});

test("duplicate email detection groups normalized addresses without exposing records", () => {
  assert.deepEqual(
    findDuplicateEmails([
      "Person@Example.com",
      "person@example.COM ",
      "other@example.com",
      " OTHER@example.com",
      "unique@example.com",
    ]),
    [
      { email: "other@example.com", count: 2 },
      { email: "person@example.com", count: 2 },
    ],
  );
});

test("email index creation is skipped when normalized duplicates exist", async () => {
  let createCalls = 0;

  const created = await createEmailIndexIfSafe(
    ["person@example.com", "Person@example.com"],
    async () => { createCalls += 1; },
  );

  assert.equal(created, false);
  assert.equal(createCalls, 0);
});

test("email index creation runs once after a clean duplicate check", async () => {
  let createCalls = 0;

  const created = await createEmailIndexIfSafe(
    ["person@example.com", "other@example.com"],
    async () => { createCalls += 1; },
  );

  assert.equal(created, true);
  assert.equal(createCalls, 1);
});

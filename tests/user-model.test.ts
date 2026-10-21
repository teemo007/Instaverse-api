import assert from "node:assert/strict";
import { test } from "node:test";

import User from "../models/user.js";
import {
  findUserForPassword,
  toPublicUser,
} from "../services/authValidation.js";

test("password hashes are optional and excluded from ordinary user queries", () => {
  const passwordPath = User.schema.path("password");

  assert.equal(passwordPath.options.required, false);
  assert.equal(passwordPath.options.select, false);
});

test("Google subjects use a sparse unique index", () => {
  const googleIndex = User.schema
    .indexes()
    .find(([fields]) => fields.googleSubject === 1);

  assert.ok(googleIndex);
  assert.equal(googleIndex[1].unique, true);
  assert.equal(googleIndex[1].sparse, true);
});

test("public users never include password hashes or provider identifiers", () => {
  const user = {
    _id: "507f1f77bcf86cd799439011",
    username: "Kyle",
    email: "kyle@example.com",
    password: "$2a$12$secret-hash",
    googleSubject: "google-subject",
    emailVerifiedAt: new Date("2026-10-20T00:00:00.000Z"),
  };

  assert.deepEqual(toPublicUser(user), {
    _id: "507f1f77bcf86cd799439011",
    username: "Kyle",
    email: "kyle@example.com",
  });
});

test("password authentication explicitly selects the hidden hash", () => {
  const query = findUserForPassword(" Person@Example.COM ");

  assert.deepEqual(query.getQuery(), { email: "person@example.com" });
  assert.deepEqual(query.projection(), { "+password": 1 });
});

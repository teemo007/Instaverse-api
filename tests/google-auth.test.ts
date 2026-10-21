import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { LoginTicket, OAuth2Client } from "google-auth-library";

import {
  googleLink,
  googleSignin,
} from "../controllers/users.js";
import Session from "../models/session.js";
import User from "../models/user.js";
import {
  GoogleIdentityError,
  verifyGoogleCredential,
} from "../services/googleIdentity.js";

const originalClientId = process.env.GOOGLE_CLIENT_ID;

const response = () => {
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    cookies: [] as unknown[][],
    status(code: number) { result.statusCode = code; return result; },
    json(body: unknown) { result.body = body; return result; },
    cookie(...args: unknown[]) { result.cookies.push(args); return result; },
  };
  return result as unknown as Response & typeof result;
};

const nextCapture = () => {
  let received: unknown;
  return {
    next: ((error?: unknown) => { received = error; }) as NextFunction,
    error: () => received,
  };
};

const payload = (overrides: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  sub: "google-subject-1",
  aud: "test-client-id",
  iat: 1,
  exp: 4_000_000_000,
  email: " Person@Example.com ",
  email_verified: true,
  name: "Person Name",
  ...overrides,
});

const verifyAs = (overrides: Record<string, unknown> = {}) => {
  let options: unknown;
  mock.method(OAuth2Client.prototype, "verifyIdToken", async (value: unknown) => {
    options = value;
    return new LoginTicket("envelope", payload(overrides) as never);
  });
  return () => options;
};

const passwordQuery = (value: unknown) => ({
  select: async () => value,
}) as unknown as ReturnType<typeof User.findOne>;

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
});

afterEach(() => {
  mock.restoreAll();
  if (originalClientId === undefined) {
    delete process.env.GOOGLE_CLIENT_ID;
  } else {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
  }
});

test("Google credential verification pins the audience and normalizes verified identity", async () => {
  const options = verifyAs();

  const identity = await verifyGoogleCredential("signed-id-credential");

  assert.deepEqual(options(), {
    idToken: "signed-id-credential",
    audience: "test-client-id",
  });
  assert.deepEqual(identity, {
    subject: "google-subject-1",
    email: "person@example.com",
    name: "Person Name",
    emailVerified: true,
  });
});

test("Google verification rejects provider failures and incomplete identities safely", async () => {
  mock.method(OAuth2Client.prototype, "verifyIdToken", async () => {
    throw new Error("wrong audience: sensitive provider detail");
  });
  await assert.rejects(
    verifyGoogleCredential("bad-credential"),
    (error: unknown) =>
      error instanceof GoogleIdentityError &&
      error.code === "INVALID_GOOGLE_CREDENTIAL" &&
      !error.message.includes("sensitive"),
  );
  mock.restoreAll();

  for (const invalidPayload of [
    { email_verified: false },
    { email: undefined },
    { sub: "" },
  ]) {
    verifyAs(invalidPayload);
    await assert.rejects(
      verifyGoogleCredential("incomplete-credential"),
      (error: unknown) =>
        error instanceof GoogleIdentityError &&
        error.code === "INVALID_GOOGLE_CREDENTIAL",
    );
    mock.restoreAll();
  }
});

test("missing Google credentials are rejected before provider or database access", async () => {
  let databaseCalls = 0;
  mock.method(User, "findOne", async () => {
    databaseCalls += 1;
    return null;
  });
  const res = response();

  await googleSignin({ body: {} } as Request, res, nextCapture().next);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    message: "A valid Google credential is required.",
    code: "INVALID_GOOGLE_CREDENTIAL",
  });
  assert.equal(databaseCalls, 0);
});

test("an existing Google subject signs in without persisting the credential", async () => {
  verifyAs();
  const user = {
    _id: "507f1f77bcf86cd799439011",
    username: "Person",
    email: "old-address@example.com",
    googleSubject: "google-subject-1",
  };
  let lookup: unknown;
  mock.method(User, "findOne", async (filter: unknown) => {
    lookup = filter;
    return user;
  });
  mock.method(Session, "create", async (value: unknown) => value);
  const res = response();

  await googleSignin(
    { body: { credential: "signed-id-credential" } } as Request,
    res,
    nextCapture().next,
  );

  assert.deepEqual(lookup, { googleSubject: "google-subject-1" });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body).includes("signed-id-credential"), false);
  assert.deepEqual((res.body as { user: unknown }).user, {
    _id: user._id,
    username: "Person",
    email: "old-address@example.com",
  });
});

test("a new verified Google identity creates a passwordless user with a bounded available username", async () => {
  verifyAs({ name: "A".repeat(80) });
  const lookups: unknown[] = [];
  mock.method(User, "findOne", async (filter: unknown) => {
    lookups.push(filter);
    return null;
  });
  mock.method(User, "exists", async () => null);
  let created: Record<string, unknown> | undefined;
  mock.method(User, "create", async (value: Record<string, unknown>) => {
    created = value;
    return { _id: "507f1f77bcf86cd799439012", ...value };
  });
  mock.method(Session, "create", async (value: unknown) => value);
  const res = response();

  await googleSignin(
    { body: { credential: "signed-id-credential" } } as Request,
    res,
    nextCapture().next,
  );

  assert.deepEqual(lookups, [
    { googleSubject: "google-subject-1" },
    { email: "person@example.com" },
  ]);
  assert.equal(res.statusCode, 201);
  assert.equal(typeof created?.username, "string");
  assert.ok((created?.username as string).length <= 50);
  assert.equal(created?.email, "person@example.com");
  assert.equal(created?.googleSubject, "google-subject-1");
  assert.ok(created?.emailVerifiedAt instanceof Date);
  assert.equal("password" in (created ?? {}), false);
  assert.equal("credential" in (created ?? {}), false);
});

test("same-email Google sign-in requests password linking without account details", async () => {
  verifyAs();
  mock.method(User, "findOne", async (filter: Record<string, unknown>) =>
    "googleSubject" in filter ? null : { _id: "hidden-user-id" },
  );
  const res = response();

  await googleSignin(
    { body: { credential: "signed-id-credential" } } as Request,
    res,
    nextCapture().next,
  );

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    message: "Sign in with your existing password to link Google.",
    code: "ACCOUNT_LINK_REQUIRED",
  });
  assert.equal(JSON.stringify(res.body).includes("hidden-user-id"), false);
});

test("Google linking re-verifies the password and atomically binds the subject", async () => {
  verifyAs();
  const user = {
    _id: "507f1f77bcf86cd799439013",
    username: "Existing",
    email: "person@example.com",
    password: "stored-password-hash",
  };
  const lookups: unknown[] = [];
  mock.method(User, "findOne", (filter: unknown) => {
    lookups.push(filter);
    if ((filter as Record<string, unknown>).googleSubject) return Promise.resolve(null);
    return passwordQuery(user);
  });
  mock.method(bcrypt, "compare", async () => true);
  let update: unknown;
  mock.method(User, "updateOne", async (...args: unknown[]) => {
    update = args;
    return { modifiedCount: 1 };
  });
  mock.method(Session, "create", async (value: unknown) => value);
  const res = response();

  await googleLink(
    {
      body: {
        credential: "signed-id-credential",
        password: "existing-password",
      },
    } as Request,
    res,
    nextCapture().next,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(lookups, [
    { googleSubject: "google-subject-1" },
    { email: "person@example.com" },
  ]);
  assert.deepEqual((update as unknown[])[0], {
    _id: user._id,
    googleSubject: { $exists: false },
  });
  assert.deepEqual((update as unknown[])[1], {
    $set: {
      googleSubject: "google-subject-1",
      emailVerifiedAt: (update as unknown[])[1] &&
        ((update as unknown[])[1] as { $set: { emailVerifiedAt: unknown } }).$set.emailVerifiedAt,
    },
  });
  assert.ok(
    ((update as unknown[])[1] as { $set: { emailVerifiedAt: unknown } }).$set
      .emailVerifiedAt instanceof Date,
  );
  assert.equal(JSON.stringify(res.body).includes("stored-password-hash"), false);
});

test("Google linking rejects wrong passwords and subjects already bound elsewhere", async () => {
  verifyAs();
  mock.method(User, "findOne", (filter: Record<string, unknown>) =>
    "googleSubject" in filter
      ? Promise.resolve(null)
      : passwordQuery({
          _id: "507f1f77bcf86cd799439013",
          username: "Existing",
          email: "person@example.com",
          password: "stored-password-hash",
        }),
  );
  mock.method(bcrypt, "compare", async () => false);
  const wrongPassword = response();

  await googleLink(
    { body: { credential: "signed-id-credential", password: "wrong" } } as Request,
    wrongPassword,
    nextCapture().next,
  );

  assert.equal(wrongPassword.statusCode, 401);
  assert.equal((wrongPassword.body as { code: string }).code, "INVALID_CREDENTIALS");
  mock.restoreAll();

  verifyAs();
  mock.method(User, "findOne", async () => ({ _id: "other-user" }));
  const conflict = response();
  await googleLink(
    { body: { credential: "signed-id-credential", password: "unused" } } as Request,
    conflict,
    nextCapture().next,
  );

  assert.equal(conflict.statusCode, 409);
  assert.deepEqual(conflict.body, {
    message: "This Google account is already linked.",
    code: "GOOGLE_ACCOUNT_CONFLICT",
  });
});

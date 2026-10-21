import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";

import {
  getSession,
  signin,
  signout,
  signup,
} from "../controllers/users.js";
import Session from "../models/session.js";
import User from "../models/user.js";
import {
  SESSION_COOKIE_NAME,
  hashSessionToken,
} from "../services/session.js";

const response = () => {
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    cookies: [] as unknown[][],
    cleared: [] as unknown[][],
    sent: false,
    status(code: number) { result.statusCode = code; return result; },
    json(body: unknown) { result.body = body; return result; },
    cookie(...args: unknown[]) { result.cookies.push(args); return result; },
    clearCookie(...args: unknown[]) { result.cleared.push(args); return result; },
    send() { result.sent = true; return result; },
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

const passwordQuery = (value: unknown) => ({
  select: async () => value,
}) as unknown as ReturnType<typeof User.findOne>;

const validPassword = "correct-password";

afterEach(() => mock.restoreAll());

test("unknown, wrong-password, and passwordless accounts share one public error and bounded bcrypt work", async () => {
  const users = [
    null,
    { _id: "user-1", email: "person@example.com", password: "stored-hash" },
    { _id: "user-2", email: "google@example.com" },
  ];
  let compareCalls = 0;
  mock.method(User, "findOne", () => passwordQuery(users.shift()));
  mock.method(bcrypt, "compare", async () => {
    compareCalls += 1;
    return false;
  });

  for (const email of ["missing@example.com", "person@example.com", "google@example.com"]) {
    const res = response();
    await signin(
      { body: { email, password: validPassword } } as Request,
      res,
      nextCapture().next,
    );
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, {
      message: "Email or password is incorrect.",
      code: "INVALID_CREDENTIALS",
    });
  }
  assert.equal(compareCalls, 3);
});

test("successful password sign-in creates a session without exposing a hash", async () => {
  const user = {
    _id: "507f1f77bcf86cd799439011",
    username: "Kyle",
    email: "kyle@example.com",
    password: "stored-hash",
  };
  let storedSession: Record<string, unknown> | undefined;
  mock.method(User, "findOne", () => passwordQuery(user));
  mock.method(bcrypt, "compare", async () => true);
  mock.method(Session, "create", async (value: Record<string, unknown>) => {
    storedSession = value;
    return value;
  });
  const res = response();

  await signin(
    { body: { email: " KYLE@example.com ", password: validPassword } } as Request,
    res,
    nextCapture().next,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual((res.body as { user: unknown }).user, {
    _id: user._id,
    username: "Kyle",
    email: "kyle@example.com",
  });
  assert.equal(typeof (res.body as { csrfToken: unknown }).csrfToken, "string");
  assert.equal(JSON.stringify(res.body).includes("stored-hash"), false);
  assert.equal(storedSession?.userId, user._id);
  assert.equal(res.cookies[0]?.[0], SESSION_COOKIE_NAME);
});

test("sign-up validates input before database access", async () => {
  let databaseCalls = 0;
  mock.method(User, "findOne", async () => {
    databaseCalls += 1;
    return null;
  });
  const cases = [
    { username: "Kyle", email: "bad", password: validPassword, confirmPassword: validPassword },
    { username: "Kyle", email: "kyle@example.com", password: "short", confirmPassword: "short" },
    { username: "Kyle", email: "kyle@example.com", password: validPassword, confirmPassword: "different-password" },
  ];

  for (const body of cases) {
    const res = response();
    await signup({ body } as Request, res, nextCapture().next);
    assert.equal(res.statusCode, 400);
    assert.equal((res.body as { code: string }).code, "VALIDATION_FAILED");
  }
  assert.equal(databaseCalls, 0);
});

test("sign-up normalizes email, hashes with cost 12, and returns only a public user", async () => {
  let lookup: unknown;
  let createdUser: unknown;
  let hashRounds: number | undefined;
  mock.method(User, "findOne", async (filter: unknown) => {
    lookup = filter;
    return null;
  });
  mock.method(bcrypt, "hash", async (_password: string, rounds: number) => {
    hashRounds = rounds;
    return "new-hash";
  });
  mock.method(User, "create", async (value: unknown) => {
    createdUser = value;
    return {
      _id: "507f1f77bcf86cd799439012",
      ...(value as object),
    };
  });
  mock.method(Session, "create", async (value: unknown) => value);
  const res = response();

  await signup({
    body: {
      username: " Kyle ",
      email: " KYLE@Example.COM ",
      password: validPassword,
      confirmPassword: validPassword,
    },
  } as Request, res, nextCapture().next);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(lookup, { email: "kyle@example.com" });
  assert.equal(hashRounds, 12);
  assert.deepEqual(createdUser, {
    username: "Kyle",
    email: "kyle@example.com",
    password: "new-hash",
  });
  assert.equal(JSON.stringify(res.body).includes("new-hash"), false);
  assert.equal(res.cookies[0]?.[0], SESSION_COOKIE_NAME);
});

test("session restore returns the current public user and CSRF token", async () => {
  const token = "ab".repeat(32);
  let update: unknown;
  mock.method(Session, "findOne", async () => ({
    userId: "507f1f77bcf86cd799439011",
    csrfToken: "csrf-token",
  }));
  mock.method(Session, "updateOne", async (...args: unknown[]) => {
    update = args;
    return { modifiedCount: 1 };
  });
  mock.method(User, "findById", async () => ({
    _id: "507f1f77bcf86cd799439011",
    username: "Kyle",
    email: "kyle@example.com",
  }));
  const res = response();

  await getSession({
    cookies: { [SESSION_COOKIE_NAME]: token },
  } as unknown as Request, res, nextCapture().next);

  assert.deepEqual(res.body, {
    user: {
      _id: "507f1f77bcf86cd799439011",
      username: "Kyle",
      email: "kyle@example.com",
    },
    csrfToken: "csrf-token",
  });
  assert.deepEqual((update as unknown[])[0], {
    tokenHash: hashSessionToken(token),
  });
  assert.ok((update as unknown[])[1] instanceof Object);
});

test("missing session restoration returns 401 and clears the cookie", async () => {
  const res = response();

  await getSession({ cookies: {} } as unknown as Request, res, nextCapture().next);

  assert.equal(res.statusCode, 401);
  assert.equal((res.body as { code: string }).code, "UNAUTHENTICATED");
  assert.equal(res.cleared[0]?.[0], SESSION_COOKIE_NAME);
});

test("sign-out deletes the hashed session and clears its cookie", async () => {
  const token = "cd".repeat(32);
  let deletion: unknown;
  mock.method(Session, "deleteOne", async (filter: unknown) => {
    deletion = filter;
    return { deletedCount: 1 };
  });
  const res = response();

  await signout({
    cookies: { [SESSION_COOKIE_NAME]: token },
  } as unknown as Request, res, nextCapture().next);

  assert.equal(res.statusCode, 204);
  assert.equal(res.sent, true);
  assert.deepEqual(deletion, { tokenHash: hashSessionToken(token) });
  assert.equal(res.cleared[0]?.[0], SESSION_COOKIE_NAME);
});

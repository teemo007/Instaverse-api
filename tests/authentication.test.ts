import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { NextFunction, Request, Response } from "express";

import authentication from "../middlewares/authentication.js";
import Session from "../models/session.js";
import User from "../models/user.js";
import { SESSION_COOKIE_NAME, hashSessionToken } from "../services/session.js";

const token = "ab".repeat(32);

const request = (cookie?: unknown) => ({
  cookies: cookie === undefined ? {} : { [SESSION_COOKIE_NAME]: cookie },
}) as Request;

const response = () => {
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    cleared: [] as unknown[][],
    status(code: number) { result.statusCode = code; return result; },
    json(body: unknown) { result.body = body; return result; },
    clearCookie(...args: unknown[]) { result.cleared.push(args); return result; },
  };
  return result as unknown as Response & typeof result;
};

const nextCapture = () => {
  let calls = 0;
  let received: unknown;
  return {
    next: ((error?: unknown) => { calls += 1; received = error; }) as NextFunction,
    calls: () => calls,
    error: () => received,
  };
};

afterEach(() => mock.restoreAll());

test("an active session authenticates the request", async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  mock.method(Session, "findOne", async () => ({
    userId: "507f1f77bcf86cd799439011",
    csrfToken: "csrf-token",
    expiresAt,
  }));
  mock.method(User, "exists", async () => ({ _id: "507f1f77bcf86cd799439011" }));
  const req = request(token);
  const counter = nextCapture();

  await authentication(req, response(), counter.next);

  assert.equal(counter.calls(), 1);
  assert.equal(counter.error(), undefined);
  assert.equal(req.userId, "507f1f77bcf86cd799439011");
  assert.deepEqual(req.authSession, {
    token,
    csrfToken: "csrf-token",
    expiresAt,
  });
});

test("missing and malformed cookies return 401 and clear the session cookie", async () => {
  let queries = 0;
  mock.method(Session, "findOne", async () => {
    queries += 1;
    return null;
  });

  for (const cookie of [undefined, "malformed"]) {
    const res = response();
    const counter = nextCapture();
    await authentication(request(cookie), res, counter.next);
    assert.equal(counter.calls(), 0);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, {
      message: "Sign in required.",
      code: "UNAUTHENTICATED",
    });
    assert.equal(res.cleared[0]?.[0], SESSION_COOKIE_NAME);
  }
  assert.equal(queries, 0);
});

test("expired sessions return 401 without exposing lookup details", async () => {
  let lookup: unknown;
  mock.method(Session, "findOne", async (filter: unknown) => {
    lookup = filter;
    return null;
  });
  const res = response();

  await authentication(request(token), res, nextCapture().next);

  assert.equal(res.statusCode, 401);
  assert.equal((res.body as { code: string }).code, "UNAUTHENTICATED");
  assert.deepEqual((lookup as { tokenHash: string }).tokenHash, hashSessionToken(token));
  assert.ok((lookup as { expiresAt: { $gt: unknown } }).expiresAt.$gt instanceof Date);
});

test("orphaned sessions are deleted and rejected", async () => {
  mock.method(Session, "findOne", async () => ({
    userId: "507f1f77bcf86cd799439099",
    csrfToken: "csrf-token",
    expiresAt: new Date(Date.now() + 60_000),
  }));
  mock.method(User, "exists", async () => null);
  let deleted: unknown;
  mock.method(Session, "deleteOne", async (filter: unknown) => {
    deleted = filter;
    return { deletedCount: 1 };
  });
  const res = response();

  await authentication(request(token), res, nextCapture().next);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(deleted, { tokenHash: hashSessionToken(token) });
  assert.equal(res.cleared[0]?.[0], SESSION_COOKIE_NAME);
});

test("unexpected authentication failures are forwarded without leaking details", async () => {
  const failure = new Error("database password appeared here");
  mock.method(Session, "findOne", async () => { throw failure; });
  const res = response();
  const capture = nextCapture();

  await authentication(request(token), res, capture.next);

  assert.equal(capture.error(), failure);
  assert.equal(res.body, undefined);
});

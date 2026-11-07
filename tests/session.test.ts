import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { Request, Response } from "express";

import Session from "../models/session.js";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createSession,
  deleteSession,
  hashSessionToken,
  readSessionCookie,
  resolveSession,
  setSessionCookie,
} from "../services/session.js";

afterEach(() => {
  mock.restoreAll();
  delete process.env.NODE_ENV;
});

test("session creation stores only a token hash and expires after 24 hours", async () => {
  let stored: Record<string, unknown> | undefined;
  mock.method(Session, "create", async (value: Record<string, unknown>) => {
    stored = value;
    return value;
  });
  const before = Date.now();

  const created = await createSession("507f1f77bcf86cd799439011");
  const after = Date.now();

  assert.equal(Buffer.from(created.sessionToken, "hex").length, 32);
  assert.equal(Buffer.from(created.csrfToken, "hex").length, 32);
  assert.notEqual(created.sessionToken, created.csrfToken);
  assert.equal(stored?.tokenHash, hashSessionToken(created.sessionToken));
  assert.notEqual(stored?.tokenHash, created.sessionToken);
  assert.equal(stored?.csrfToken, created.csrfToken);
  assert.ok(stored?.expiresAt instanceof Date);
  assert.ok(stored.expiresAt.getTime() >= before + 86_400_000);
  assert.ok(stored.expiresAt.getTime() <= after + 86_400_000);
});

test("session documents configure unique token and TTL cleanup indexes", () => {
  const indexes = Session.schema.indexes();
  const tokenIndex = indexes.find(([fields]) => fields.tokenHash === 1);
  const expiryIndex = indexes.find(([fields]) => fields.expiresAt === 1);

  assert.ok(tokenIndex);
  assert.equal(tokenIndex[1].unique, true);
  assert.ok(expiryIndex);
  assert.equal(expiryIndex[1].expireAfterSeconds, 0);
});

test("active session lookup hashes a well-formed token and enforces expiry", async () => {
  const now = new Date("2026-10-20T12:00:00.000Z");
  const token = "ab".repeat(32);
  const expected = { userId: "user-1", csrfToken: "csrf" };
  let filter: unknown;
  mock.method(Session, "findOne", async (value: unknown) => {
    filter = value;
    return expected;
  });

  assert.equal(await resolveSession(token, now), expected);
  assert.deepEqual(filter, {
    tokenHash: hashSessionToken(token),
    expiresAt: { $gt: now },
  });
});

test("malformed tokens are rejected without querying or throwing", async () => {
  let queryCalls = 0;
  mock.method(Session, "findOne", async () => {
    queryCalls += 1;
    return null;
  });

  assert.equal(await resolveSession("not-a-session-token"), null);
  assert.equal(queryCalls, 0);
  await deleteSession("not-a-session-token");
  assert.equal(queryCalls, 0);
});

test("session deletion hashes valid tokens before deleting", async () => {
  const token = "cd".repeat(32);
  let filter: unknown;
  mock.method(Session, "deleteOne", async (value: unknown) => {
    filter = value;
    return { deletedCount: 1 };
  });

  await deleteSession(token);

  assert.deepEqual(filter, { tokenHash: hashSessionToken(token) });
});

test("production session cookies are secure, host-only, and browser-session scoped", () => {
  process.env.NODE_ENV = "production";
  let received: unknown[] = [];
  const res = {
    cookie: (...args: unknown[]) => { received = args; },
  } as unknown as Response;

  setSessionCookie(res, "ab".repeat(32));

  assert.equal(received[0], SESSION_COOKIE_NAME);
  assert.equal(received[1], "ab".repeat(32));
  assert.deepEqual(received[2], {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
});

test("development cookie parsing and clearing use the same host-only scope", () => {
  const token = "ef".repeat(32);
  const req = { cookies: { [SESSION_COOKIE_NAME]: token } } as unknown as Request;
  let received: unknown[] = [];
  const res = {
    clearCookie: (...args: unknown[]) => { received = args; },
  } as unknown as Response;

  assert.equal(readSessionCookie(req), token);
  assert.equal(readSessionCookie({
    cookies: { [SESSION_COOKIE_NAME]: "bad" },
  } as unknown as Request), undefined);
  clearSessionCookie(res);
  assert.deepEqual(received, [SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
  }]);
});

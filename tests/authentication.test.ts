import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import authentication from "../middlewares/authentication.js";

const request = (authorization?: string) => ({
  headers: authorization ? { authorization } : {},
}) as Request;

const response = () => {
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { result.statusCode = code; return result; },
    json(body: unknown) { result.body = body; return result; },
  };
  return result as unknown as Response & { statusCode: number; body: unknown };
};

const nextCounter = () => {
  let calls = 0;
  return { next: (() => { calls += 1; }) as NextFunction, calls: () => calls };
};

afterEach(() => mock.restoreAll());

test("continues anonymous requests without setting a user", async () => {
  const req = request();
  const res = response();
  const counter = nextCounter();
  await authentication(req, res, counter.next);
  assert.equal(counter.calls(), 1);
  assert.equal(req.userId, undefined);
});

test("sets userId from an object JWT payload", async () => {
  mock.method(jwt, "verify", () => ({ uid: "user-123" }));
  const req = request("Bearer token");
  const counter = nextCounter();
  await authentication(req, response(), counter.next);
  assert.equal(counter.calls(), 1);
  assert.equal(req.userId, "user-123");
});

test("ignores decoded JWT strings or payloads without uid", async () => {
  for (const decoded of ["payload", {}]) {
    mock.method(jwt, "verify", () => decoded);
    const req = request("Bearer token");
    const counter = nextCounter();
    await authentication(req, response(), counter.next);
    assert.equal(counter.calls(), 1);
    assert.equal(req.userId, undefined);
    mock.restoreAll();
  }
});

test("returns the existing 403 response for invalid tokens", async () => {
  mock.method(console, "log", () => {});
  mock.method(jwt, "verify", () => { throw new Error("invalid"); });
  const req = request("Bearer token");
  const res = response();
  const counter = nextCounter();
  await authentication(req, res, counter.next);
  assert.equal(counter.calls(), 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Invalid token" });
});

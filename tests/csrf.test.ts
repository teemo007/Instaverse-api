import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";

import { requireCsrf } from "../middlewares/csrf.js";
import { requireJson } from "../middlewares/requireJson.js";

const response = () => {
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { result.statusCode = code; return result; },
    json(body: unknown) { result.body = body; return result; },
  };
  return result as unknown as Response & typeof result;
};

const nextCounter = () => {
  let calls = 0;
  return {
    next: (() => { calls += 1; }) as NextFunction,
    calls: () => calls,
  };
};

const request = (
  method: string,
  headers: Record<string, string> = {},
): Request => ({
  method,
  headers,
  authSession: {
    token: "ab".repeat(32),
    csrfToken: "csrf-token",
    expiresAt: new Date(Date.now() + 60_000),
  },
  get(name: string) {
    return headers[name.toLowerCase()];
  },
  is(type: string) {
    return headers["content-type"]?.startsWith(type) ? type : false;
  },
}) as unknown as Request;

test("safe requests bypass CSRF checks", () => {
  const counter = nextCounter();
  requireCsrf(request("GET"), response(), counter.next);
  assert.equal(counter.calls(), 1);
});

test("unsafe requests accept only the active token from an allowed origin", () => {
  const previousOrigin = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_ORIGIN = "https://frontend.example";
  try {
    const counter = nextCounter();
    requireCsrf(
      request("POST", {
        origin: "https://frontend.example",
        "x-csrf-token": "csrf-token",
      }),
      response(),
      counter.next,
    );
    assert.equal(counter.calls(), 1);
  } finally {
    if (previousOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = previousOrigin;
  }
});

test("unsafe requests reject missing or incorrect CSRF tokens", () => {
  const previousOrigin = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_ORIGIN = "https://frontend.example";
  try {
    for (const token of [undefined, "wrong-token"]) {
      const res = response();
      requireCsrf(
        request("PATCH", {
          origin: "https://frontend.example",
          ...(token ? { "x-csrf-token": token } : {}),
        }),
        res,
        nextCounter().next,
      );
      assert.equal(res.statusCode, 403);
      assert.deepEqual(res.body, {
        message: "Request verification failed.",
        code: "CSRF_INVALID",
      });
    }
  } finally {
    if (previousOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = previousOrigin;
  }
});

test("production rejects unsafe requests with foreign or missing origins", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousOrigin = process.env.FRONTEND_ORIGIN;
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_ORIGIN = "https://frontend.example";
  try {
    for (const origin of [undefined, "https://evil.example"]) {
      const res = response();
      requireCsrf(
        request("DELETE", {
          ...(origin ? { origin } : {}),
          "x-csrf-token": "csrf-token",
        }),
        res,
        nextCounter().next,
      );
      assert.equal(res.statusCode, 403);
      assert.equal((res.body as { code: string }).code, "CSRF_INVALID");
    }
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = previousOrigin;
  }
});

test("development accepts loopback origins on any Vite port", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    for (const origin of [
      "http://localhost:5174",
      "http://127.0.0.1:5175",
      "http://[::1]:5173",
    ]) {
      const counter = nextCounter();
      requireCsrf(
        request("POST", { origin, "x-csrf-token": "csrf-token" }),
        response(),
        counter.next,
      );
      assert.equal(counter.calls(), 1, origin);
    }

    const res = response();
    requireCsrf(
      request("POST", {
        origin: "http://localhost.evil.example:5174",
        "x-csrf-token": "csrf-token",
      }),
      res,
      nextCounter().next,
    );
    assert.equal(res.statusCode, 403);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("production does not accept loopback origins unless configured", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousOrigin = process.env.FRONTEND_ORIGIN;
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_ORIGIN = "https://frontend.example";
  try {
    const res = response();
    requireCsrf(
      request("POST", {
        origin: "http://localhost:5174",
        "x-csrf-token": "csrf-token",
      }),
      res,
      nextCounter().next,
    );
    assert.equal(res.statusCode, 403);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = previousOrigin;
  }
});

test("unsafe API requests require JSON content", () => {
  const rejected = response();
  requireJson(
    request("POST", { "content-type": "text/plain" }),
    rejected,
    nextCounter().next,
  );
  assert.equal(rejected.statusCode, 415);
  assert.deepEqual(rejected.body, {
    message: "Content-Type must be application/json.",
    code: "CONTENT_TYPE_REQUIRED",
  });

  const counter = nextCounter();
  requireJson(
    request("POST", { "content-type": "application/json; charset=utf-8" }),
    response(),
    counter.next,
  );
  assert.equal(counter.calls(), 1);
});

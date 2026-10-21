import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";

const request = (method = "GET", originalUrl = "/missing") =>
  ({ method, originalUrl }) as Request;

const response = (headersSent = false) => {
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    headersSent,
    jsonCalls: 0,
    status(code: number) { result.statusCode = code; return result; },
    json(body: unknown) { result.body = body; result.jsonCalls += 1; return result; },
  };
  return result as unknown as Response & {
    statusCode: number;
    body: unknown;
    jsonCalls: number;
  };
};

test("notFound returns the shared JSON error shape", async () => {
  const { notFound } = await import("../middlewares/errorHandler.js");
  const res = response();

  notFound(request("GET", "/missing"), res, (() => {}) as NextFunction);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { message: "Route GET /missing was not found." });
});

test("errorHandler hides unexpected error details", async () => {
  const { errorHandler } = await import("../middlewares/errorHandler.js");
  const res = response();

  errorHandler(
    new Error("database password leaked"),
    request(),
    res,
    (() => {}) as NextFunction,
  );

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Something went wrong." });
});

test("errorHandler preserves explicit HTTP errors", async () => {
  const { HttpError, errorHandler } = await import("../middlewares/errorHandler.js");
  const res = response();

  errorHandler(
    new HttpError(503, "Service unavailable."),
    request(),
    res,
    (() => {}) as NextFunction,
  );

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { message: "Service unavailable." });
});

test("errorHandler includes stable codes from explicit application errors", async () => {
  const { HttpError, errorHandler } = await import("../middlewares/errorHandler.js");
  const res = response();

  errorHandler(
    new HttpError(401, "Sign in required.", "UNAUTHENTICATED"),
    request(),
    res,
    (() => {}) as NextFunction,
  );

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    message: "Sign in required.",
    code: "UNAUTHENTICATED",
  });
});

test("errorHandler preserves exposable parser 4xx errors", async () => {
  const { errorHandler } = await import("../middlewares/errorHandler.js");
  const res = response();
  const parserError = Object.assign(new Error("Unexpected end of JSON input"), {
    expose: true,
    status: 400,
  });

  errorHandler(parserError, request(), res, (() => {}) as NextFunction);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: "Unexpected end of JSON input" });
});

test("errorHandler delegates after response headers have been sent", async () => {
  const { errorHandler } = await import("../middlewares/errorHandler.js");
  const failure = new Error("stream failed");
  const res = response(true);
  let received: unknown;

  errorHandler(failure, request(), res, ((error: unknown) => {
    received = error;
  }) as NextFunction);

  assert.equal(received, failure);
  assert.equal(res.jsonCalls, 0);
});

import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { NextFunction, Request, Response } from "express";

import CommentController from "../controllers/comments.js";
import { getStories } from "../controllers/stories.js";
import { signin, signup } from "../controllers/users.js";
import Comment from "../models/comment.js";
import Story from "../models/storyContent.js";
import User from "../models/user.js";

const response = () => {
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { result.statusCode = code; return result; },
    json(body: unknown) { result.body = body; return result; },
  };
  return result as unknown as Response & { statusCode: number; body: unknown };
};

const nextCapture = () => {
  let received: unknown;
  return {
    next: ((error: unknown) => { received = error; }) as NextFunction,
    error: () => received,
  };
};

afterEach(() => mock.restoreAll());

test("signin forwards unexpected errors to the shared handler", async () => {
  const failure = new Error("database unavailable");
  mock.method(User, "findOne", () => ({
    select: async () => { throw failure; },
  }) as unknown as ReturnType<typeof User.findOne>);
  const req = { body: { email: "person@example.com", password: "secret" } } as Request;
  const res = response();
  const capture = nextCapture();

  await signin(req, res, capture.next);

  assert.equal(capture.error(), failure);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
});

test("getStories forwards unexpected errors to the shared handler", async () => {
  const failure = new Error("database unavailable");
  mock.method(Story, "find", () => ({
    populate: async () => { throw failure; },
  }) as unknown as ReturnType<typeof Story.find>);
  const res = response();
  const capture = nextCapture();

  await getStories({} as Request, res, capture.next);

  assert.equal(capture.error(), failure);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
});

test("auth handlers reject malformed request bodies with stable errors", async () => {
  const cases = [
    { handler: signin, status: 401, code: "INVALID_CREDENTIALS" },
    { handler: signup, status: 400, code: "VALIDATION_FAILED" },
  ];

  for (const { handler, status, code } of cases) {
    const capture = nextCapture();
    const res = response();

    await handler({ body: undefined } as Request, res, capture.next);

    assert.equal(capture.error(), undefined);
    assert.equal(res.statusCode, status);
    assert.equal((res.body as { code: string }).code, code);
  }
});

test("reply creation rejects malformed request bodies without touching the database", async () => {
  mock.method(Comment, "exists", () => assert.fail("No lookup expected"));
  const capture = nextCapture();
  const res = response();
  const req = {
    body: undefined,
    params: {
      story_id: "507f1f77bcf86cd799439011",
      parentCommentId: "507f191e810c19729de860ea",
    },
    userId: "user-123",
  } as unknown as Request;

  await CommentController.addReplyToCommenet(req, res, capture.next);

  assert.equal(capture.error(), undefined);
  assert.equal(res.statusCode, 400);
  assert.equal((res.body as { code: string }).code, "VALIDATION_FAILED");
});

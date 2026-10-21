import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { NextFunction, Request, Response } from "express";

import CommentController from "../controllers/comments.js";
import { getStories } from "../controllers/stories.js";
import { signin, signup } from "../controllers/users.js";
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

test("auth handlers forward malformed request bodies", async () => {
  for (const handler of [signin, signup]) {
    const capture = nextCapture();

    await handler({ body: undefined } as Request, response(), capture.next);

    assert.ok(capture.error() instanceof TypeError);
  }
});

test("reply creation forwards malformed request bodies", async () => {
  const capture = nextCapture();
  const req = {
    body: undefined,
    params: {
      story_id: "507f1f77bcf86cd799439011",
      parentCommentId: "507f191e810c19729de860ea",
    },
    userId: "user-123",
  } as unknown as Request;

  await CommentController.addReplyToCommenet(req, response(), capture.next);

  assert.ok(capture.error() instanceof TypeError);
});

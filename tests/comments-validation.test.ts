import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import CommentController from "../controllers/comments.js";
import Comment from "../models/comment.js";
import Story from "../models/storyContent.js";

const storyId = "507f1f77bcf86cd799439011";
const otherStoryId = "507f1f77bcf86cd799439099";
const parentId = "507f191e810c19729de860ea";
const userId = "507f1f77bcf86cd799439012";
const forgedId = "507f1f77bcf86cd799439013";

const response = () => {
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { result.statusCode = code; return result; },
    json(body: unknown) { result.body = body; return result; },
    send(body: unknown) { result.body = body; return result; },
  };
  return result;
};

const invoke = async (
  handler: RequestHandler,
  req: Partial<Request>,
  res: ReturnType<typeof response>,
) => {
  let forwarded: unknown;
  await handler(req as Request, res as unknown as Response, ((error: unknown) => {
    forwarded = error;
  }) as NextFunction);
  return forwarded;
};

// A thenable query whose .populate() calls chain and finally resolve to `value`.
const query = (value: unknown) => {
  const chain = {
    populate: () => chain,
    then: (resolve: (result: unknown) => unknown) => resolve(value),
  };
  return chain;
};

const captureSaves = () => {
  const saved: Array<Record<string, unknown>> = [];
  mock.method(Comment.prototype, "save", async function (this: InstanceType<typeof Comment>) {
    saved.push(this.toObject() as unknown as Record<string, unknown>);
    return this;
  });
  return saved;
};

afterEach(() => mock.restoreAll());

test("new comments keep only the text and ignore injected fields", async () => {
  mock.method(Story, "exists", async () => ({ _id: storyId }));
  mock.method(Story, "findByIdAndUpdate", async () => null);
  mock.method(Comment, "findById", () => query({ content: "nice" }));
  const saved = captureSaves();
  const res = response();

  const error = await invoke(CommentController.addComment, {
    userId,
    params: { story_id: storyId },
    body: {
      content: "  nice  ",
      _id: forgedId,
      user_id: forgedId,
      story_id: otherStoryId,
      parentId: forgedId,
      replies: [forgedId],
      createdAt: "2000-01-01T00:00:00.000Z",
    },
  }, res);

  assert.equal(error, undefined);
  assert.equal(res.statusCode, 201);
  assert.equal(saved.length, 1);
  const comment = saved[0]!;
  assert.equal(comment.content, "nice");
  assert.notEqual(String(comment._id), forgedId);
  assert.equal(String(comment.user_id), userId);
  assert.equal(String(comment.story_id), storyId);
  assert.equal(comment.parentId, null);
  assert.deepEqual(comment.replies, []);
  assert.ok((comment.createdAt as Date).getFullYear() > 2000);
});

test("comments and replies reject missing, blank, non-string or oversized text", async () => {
  mock.method(Story, "exists", () => assert.fail("No lookup expected"));
  mock.method(Comment, "exists", () => assert.fail("No lookup expected"));
  captureSaves();

  for (const body of [
    undefined,
    {},
    [],
    { content: "   " },
    { content: 42 },
    { content: { $gt: "" } },
    { content: "x".repeat(101) },
  ]) {
    for (const [handler, params] of [
      [CommentController.addComment, { story_id: storyId }],
      [CommentController.addReplyToCommenet, { story_id: storyId, parentCommentId: parentId }],
    ] as const) {
      const res = response();
      const error = await invoke(handler, { userId, params, body }, res);
      assert.equal(error, undefined);
      assert.equal(res.statusCode, 400, JSON.stringify(body));
      assert.equal((res.body as { code: string }).code, "VALIDATION_FAILED");
    }
  }
});

test("comments on a story that does not exist are rejected", async () => {
  mock.method(Story, "exists", async () => null);
  const saved = captureSaves();
  const res = response();

  await invoke(CommentController.addComment, {
    userId,
    params: { story_id: storyId },
    body: { content: "hello" },
  }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(saved.length, 0);
});

test("replies require a parent comment on the same story", async () => {
  const lookups: unknown[] = [];
  mock.method(Comment, "exists", async (filter: unknown) => {
    lookups.push(filter);
    return null;
  });
  const saved = captureSaves();
  mock.method(Comment, "findByIdAndUpdate", () => assert.fail("Parent must not be modified"));
  const res = response();

  const error = await invoke(CommentController.addReplyToCommenet, {
    userId,
    params: { story_id: storyId, parentCommentId: parentId },
    body: { content: "hello" },
  }, res);

  assert.equal(error, undefined);
  assert.equal(res.statusCode, 404);
  assert.equal(saved.length, 0);
  assert.deepEqual(lookups, [{ _id: parentId, story_id: storyId }]);
});

test("a reply whose parent author was deleted reports Unknown instead of crashing", async () => {
  mock.method(Comment, "exists", async () => ({ _id: parentId }));
  mock.method(Comment, "findByIdAndUpdate", async () => null);
  const saved = captureSaves();
  mock.method(Comment, "findById", () => query({
    toObject: () => ({ content: "hello", parentId: { user_id: null } }),
  }));
  const res = response();

  const error = await invoke(CommentController.addReplyToCommenet, {
    userId,
    params: { story_id: storyId, parentCommentId: parentId },
    body: { content: "hello", parentId: forgedId },
  }, res);

  assert.equal(error, undefined);
  assert.equal(res.statusCode, 201);
  assert.equal((res.body as { parentId: string }).parentId, "Unknown");
  assert.equal(String(saved[0]!.parentId), parentId);
});

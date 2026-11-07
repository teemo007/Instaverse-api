import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { createStory, updateStory, deleteStory } from "../controllers/stories.js";
import Story from "../models/storyContent.js";
import User from "../models/user.js";

const owner = "507f1f77bcf86cd799439011";
const storyId = "507f191e810c19729de860ea";
const fileId = "681c2748432c476416f3e190";
const image = `https://ik.imagekit.io/test/instaverse/stories/${owner}/photo.jpg`;
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

const response = () => {
  const result = {
    statusCode: 200, body: undefined as unknown,
    status(code: number) { result.statusCode = code; return result; },
    json(body: unknown) { result.body = body; return result; },
    send(body: unknown) { result.body = body; return result; },
  };
  return result;
};

const invoke = async (handler: RequestHandler, req: Partial<Request>, res: ReturnType<typeof response>) =>
  handler(req as Request, res as unknown as Response, (() => {}) as NextFunction);

afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

test("anonymous users cannot create stories or trigger image verification", async () => {
  mock.method(Story.prototype, "save", () => assert.fail("No database write expected"));
  const res = response();
  await invoke(createStory, { body: { caption: "new", username: "kyle", image: "base64" } }, res);
  assert.equal(res.statusCode, 401);
});

test("new stories persist verified CDN metadata and ignore injected likes", async () => {
  process.env.IMAGEKIT_PUBLIC_KEY = "public_test";
  process.env.IMAGEKIT_PRIVATE_KEY = "private_test";
  process.env.IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/test";
  globalThis.fetch = async () => Response.json({
    fileId, name: "photo.jpg", filePath: `/instaverse/stories/${owner}/photo.jpg`,
    fileType: "image", size: 1200, width: 800, height: 600,
  });
  mock.method(User, "findById", () => ({ select: async () => ({ username: "kyle" }) }) as unknown as ReturnType<typeof User.findById>);
  mock.method(Story.prototype, "save", async function (this: typeof Story.prototype) { return this; });
  const res = response();
  await invoke(createStory, { userId: owner, body: {
    caption: "new", username: "someone-else", image: "untrusted", imageFileId: fileId, likes: ["injected"],
  } }, res);
  assert.equal(res.statusCode, 201);
  const body = res.body as { username: string; image: string; imageFileId: string; imageWidth: number; likes: string[] };
  assert.equal(body.username, "kyle");
  assert.equal(body.image, image);
  assert.equal(body.imageFileId, fileId);
  assert.equal(body.imageWidth, 800);
  assert.deepEqual([...body.likes], []);
});

test("a signed-in account that no longer exists cannot create stories", async () => {
  mock.method(User, "findById", () => ({ select: async () => null }) as unknown as ReturnType<typeof User.findById>);
  mock.method(Story.prototype, "save", () => assert.fail("No database write expected"));
  globalThis.fetch = () => assert.fail("No image verification expected");
  const res = response();
  await invoke(createStory, { userId: owner, body: { caption: "new", username: "kyle", imageFileId: fileId } }, res);
  assert.equal(res.statusCode, 401);
});

test("another user cannot update or delete a story", async () => {
  mock.method(Story, "findById", async () => new Story({ _id: storyId, userId: owner, image, caption: "original", username: "kyle" }));
  mock.method(Story, "findByIdAndUpdate", () => assert.fail("Unauthorized write"));
  mock.method(Story, "findByIdAndDelete", () => assert.fail("Unauthorized deletion"));
  for (const controller of [updateStory, deleteStory]) {
    const res = response();
    await invoke(controller, { userId: "507f1f77bcf86cd799439012", params: { id: storyId }, body: { image } }, res);
    assert.equal(res.statusCode, 403);
  }
});

test("caption edits preserve legacy images and ownership without contacting ImageKit", async () => {
  const story = new Story({ _id: storyId, userId: owner, image: "data:image/png;base64,legacy", caption: "original", username: "kyle" });
  mock.method(Story, "findById", async () => story);
  mock.method(Story.prototype, "save", async function (this: typeof Story.prototype) { return this; });
  mock.method(Story, "findByIdAndUpdate", () => assert.fail("Update the authorized document only"));
  globalThis.fetch = () => assert.fail("No image upload needed for a caption edit");
  const res = response();
  await invoke(updateStory, { userId: owner, params: { id: storyId }, body: {
    caption: "updated", image: story.image, userId: "507f1f77bcf86cd799439012", imageFileId: fileId,
  } }, res);
  assert.equal(res.statusCode, 200);
  const body = res.body as { caption: string; userId: unknown; image: string; imageFileId?: string };
  assert.equal(body.caption, "updated");
  assert.equal(String(body.userId), owner);
  assert.equal(body.image, "data:image/png;base64,legacy");
  assert.equal(body.imageFileId, undefined);
});

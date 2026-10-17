import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, test } from "node:test";

import { createUploadAuthorization, resolveStoryImage } from "../services/imagekit.js";
import { getUploadAuthorization } from "../controllers/images.js";

const userId = "507f1f77bcf86cd799439011";
const fileId = "681c2748432c476416f3e190";
const uploadInput = { type: "image/jpeg", size: 1200 };
const image = "https://ik.imagekit.io/test/instaverse/stories/507f1f77bcf86cd799439011/photo.jpg";
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const file = {
  fileId,
  name: "photo.jpg",
  filePath: `/instaverse/stories/${userId}/photo.jpg`,
  fileType: "image",
  url: image,
  size: 1200,
  width: 800,
  height: 600,
};

beforeEach(() => {
  process.env.IMAGEKIT_PUBLIC_KEY = "public_test";
  process.env.IMAGEKIT_PRIVATE_KEY = "private_test";
  process.env.IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/test";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

test("issues unique five-minute upload signatures without disclosing the private key", () => {
  const before = Math.floor(Date.now() / 1000);
  const auth = createUploadAuthorization(userId, uploadInput);
  assert.ok(auth.expire >= before + 300 && auth.expire <= before + 301);
  const verified = jwt.verify(auth.token, "private_test", { algorithms: ["HS256"], complete: true });
  assert.equal(verified.header.kid, "public_test");
  assert.equal(verified.payload.exp, auth.expire);
  assert.equal(verified.payload.folder, `/instaverse/stories/${userId}`);
  assert.equal(verified.payload.overwriteFile, "false");
  assert.equal(verified.payload.isPrivateFile, "false");
  assert.ok(verified.payload.checks.includes('"file.size" <= 5242880'));
  for (const [key, value] of Object.entries(auth.fields)) assert.equal(verified.payload[key], value);
  assert.notEqual(auth.token, createUploadAuthorization(userId, uploadInput).token);
  assert.ok(!JSON.stringify(auth).includes("private_test"));
});

test("missing configuration fails with an actionable, sanitized error", () => {
  delete process.env.IMAGEKIT_PRIVATE_KEY;
  assert.throws(() => createUploadAuthorization(userId, uploadInput), { status: 503 });
});

test("upload signing rejects missing, unsupported and oversized file descriptions", () => {
  for (const input of [undefined, {}, { type: "image/svg+xml", size: 10 }, { type: "image/png", size: 5242881 }, { type: "image/png", size: 0 }]) {
    assert.throws(() => createUploadAuthorization(userId, input), { status: 400 });
  }
});

test("upload authorization rejects anonymous users", () => {
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    set() {},
  };
  getUploadAuthorization({}, res);
  assert.equal(res.statusCode, 401);
  assert.ok(!res.body.signature);
});

test("verified ImageKit metadata replaces client supplied URLs and dimensions", async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, `https://api.imagekit.io/v1/files/${fileId}/details`);
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from("private_test:").toString("base64")}`);
    return Response.json(file);
  };
  assert.deepEqual(await resolveStoryImage({ image: "https://attacker.example/photo.jpg", imageFileId: fileId, imageWidth: 999 }, userId), {
    image, imageFileId: fileId, imageWidth: 800, imageHeight: 600,
  });
});

test("new Base64 images are rejected without calling ImageKit", async () => {
  globalThis.fetch = () => assert.fail("No external request expected");
  await assert.rejects(resolveStoryImage({ image: "data:image/png;base64,new" }, userId), { status: 400 });
});

test("unchanged legacy images can be edited without ImageKit configuration", async () => {
  delete process.env.IMAGEKIT_PRIVATE_KEY;
  globalThis.fetch = () => assert.fail("No external request expected");
  const current = { image: "data:image/png;base64,legacy" };
  const result = await resolveStoryImage({ image: current.image, imageFileId: fileId }, userId, current);
  assert.equal(result.image, current.image);
  assert.equal(result.imageFileId, undefined);
});

test("another user's ImageKit file cannot be attached to a story", async () => {
  globalThis.fetch = async () => Response.json({ ...file, filePath: "/instaverse/stories/someone-else/photo.jpg" });
  await assert.rejects(resolveStoryImage({ image, imageFileId: fileId }, userId), { status: 403 });
});

test("oversized, non-image and private files cannot be published", async () => {
  for (const changes of [{ size: 5242881 }, { fileType: "non-image" }, { isPrivateFile: true }, { name: "unsafe.svg" }]) {
    globalThis.fetch = async () => Response.json({ ...file, ...changes });
    await assert.rejects(resolveStoryImage({ image, imageFileId: fileId }, userId), { status: 400 });
  }
});

test("provider failures do not expose credentials or provider response bodies", async () => {
  globalThis.fetch = async () => new Response("private_test", { status: 500 });
  await assert.rejects(resolveStoryImage({ image, imageFileId: fileId }, userId), (error) => {
    assert.equal(error.status, 502);
    assert.ok(!error.message.includes("private_test"));
    return true;
  });
});

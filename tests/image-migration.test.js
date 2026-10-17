import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import sharp from "sharp";

import { prepareLegacyImage, migrateLegacyStory, buildRestoreUpdate } from "../services/image-migration.js";
import { verifyImage } from "../scripts/migrate-images.js";

const png = await sharp({ create: { width: 16, height: 12, channels: 4, background: "#cc8844" } }).png().toBuffer();
const image = `data:image/png;base64,${png.toString("base64")}`;
const story = { _id: "507f191e810c19729de860ea", userId: "507f1f77bcf86cd799439011", image };
const verified = { image: "https://ik.imagekit.io/test/photo.png", imageFileId: "681c2748432c476416f3e190", imageWidth: 16, imageHeight: 12 };

test("valid small legacy images retain their original bytes", async () => {
  const result = await prepareLegacyImage(image);
  assert.deepEqual(result.bytes, png);
  assert.equal(result.type, "image/png");
  assert.equal(result.compressed, false);
});

test("damaged Base64 and MIME-spoofed images are rejected", async () => {
  for (const input of ["data:image/png;base64,%%%", "data:image/png;base64,YmFk", image.replace("image/png", "image/jpeg")]) {
    await assert.rejects(prepareLegacyImage(input));
  }
});

test("oversized static images are resized and compressed below the upload limit", async () => {
  const large = await sharp(randomBytes(1500 * 1500 * 3), { raw: { width: 1500, height: 1500, channels: 3 } }).png().toBuffer();
  assert.ok(large.length > 5242880);
  const result = await prepareLegacyImage(`data:image/png;base64,${large.toString("base64")}`);
  assert.equal(result.type, "image/webp");
  assert.equal(result.compressed, true);
  assert.ok(result.bytes.length <= 5242880);
  assert.equal((await sharp(result.bytes).metadata()).width, 1500);
});

test("backup and durable upload receipt precede verification and database replacement", async () => {
  const order = [];
  const result = await migrateLegacyStory(story, {
    backup: async () => order.push("backup"),
    upload: async () => { order.push("upload"); return { url: verified.image, fileId: verified.imageFileId }; },
    recordUpload: async () => order.push("receipt"),
    verify: async () => { order.push("verify"); return verified; },
    recordVerified: async () => order.push("verified"),
    update: async (filter, changes) => {
      order.push("update");
      assert.deepEqual(filter, { _id: story._id, userId: story.userId, image: story.image });
      assert.deepEqual(changes, { $set: verified });
      return { matchedCount: 1 };
    },
  });
  assert.equal(result.status, "migrated");
  assert.deepEqual(order, ["backup", "upload", "receipt", "verify", "verified", "update"]);
});

test("backup failure prevents any upload or database mutation", async () => {
  await assert.rejects(migrateLegacyStory(story, {
    backup: async () => { throw new Error("disk full"); },
    upload: () => assert.fail("Must back up first"),
    update: () => assert.fail("Must back up first"),
  }));
});

test("verification failure leaves the old MongoDB image intact", async () => {
  await assert.rejects(migrateLegacyStory(story, {
    backup: async () => {},
    upload: async () => ({ url: verified.image, fileId: verified.imageFileId }),
    recordUpload: async () => {},
    verify: async () => { throw new Error("CDN unavailable"); },
    update: () => assert.fail("Must verify before replacing the original"),
  }));
});

test("a concurrent image edit is reported as a conflict rather than overwritten", async () => {
  const result = await migrateLegacyStory(story, {
    backup: async () => {},
    upload: async () => ({ url: verified.image, fileId: verified.imageFileId }),
    recordUpload: async () => {}, verify: async () => verified, recordVerified: async () => {},
    update: async () => ({ matchedCount: 0 }),
  });
  assert.equal(result.status, "conflict");
});

test("already migrated images are skipped without calling external dependencies", async () => {
  assert.equal((await migrateLegacyStory({ ...story, image: verified.image }, {})).status, "skipped");
});

test("resume reuses the persisted file instead of uploading it twice", async () => {
  let receipt;
  const dependencies = {
    backup: async () => {}, upload: async () => ({ url: verified.image, fileId: verified.imageFileId }),
    recordUpload: async (value) => { receipt = value; },
    verify: async () => { throw new Error("temporary outage"); },
  };
  await assert.rejects(migrateLegacyStory(story, dependencies));
  const result = await migrateLegacyStory(story, {
    ...dependencies, receipt,
    upload: () => assert.fail("Do not upload again on resume"),
    verify: async () => verified, recordVerified: async () => {}, update: async () => ({ matchedCount: 1 }),
  });
  assert.equal(result.status, "migrated");
});

test("restore only replaces this migration's image and removes previously absent metadata", () => {
  const { filter, update } = buildRestoreUpdate(story, verified);
  assert.deepEqual(filter, { _id: story._id, userId: story.userId, image: verified.image, imageFileId: verified.imageFileId });
  assert.deepEqual(update, { $set: { image: story.image }, $unset: { imageFileId: "", imageWidth: "", imageHeight: "" } });
});

test("the actual CLI verification function decodes CDN image bytes before accepting them", async (context) => {
  const env = { ...process.env };
  process.env.IMAGEKIT_PUBLIC_KEY = "public_test";
  process.env.IMAGEKIT_PRIVATE_KEY = "private_test";
  process.env.IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/test";
  let cdnBytes = png;
  context.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).startsWith("https://api.imagekit.io/")) return Response.json({
      fileId: verified.imageFileId, fileType: "image", name: "photo.png",
      filePath: `/instaverse/stories/${story.userId}/photo.png`, size: png.length, width: 16, height: 12,
    });
    return new Response(cdnBytes, { headers: { "content-type": "image/png" } });
  });
  try {
    const result = await verifyImage({ url: verified.image, fileId: verified.imageFileId }, story);
    assert.equal(result.imageFileId, verified.imageFileId);
    cdnBytes = Buffer.from("not an image");
    await assert.rejects(verifyImage({ url: verified.image, fileId: verified.imageFileId }, story));
  } finally { process.env = env; }
});

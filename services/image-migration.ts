import { createHash } from "node:crypto";
import sharp from "sharp";
import { MAX_IMAGE_SIZE } from "./imagekit.js";

const metadataFields = ["image", "imageFileId", "imageWidth", "imageHeight"];

export interface PreparedLegacyImage { bytes: Buffer; type: string; compressed: boolean }
export interface LegacyStory extends Record<string, unknown> { _id: unknown; userId: unknown; image: string }
export interface UploadedImage { url: string; fileId: string }
export interface VerifiedStoryImage { image: string; imageFileId: string; imageWidth: number; imageHeight: number }
export interface MigrationReceipt { sourceHash: string; uploaded: UploadedImage }
export type MigrationStatus = "skipped" | "migrated" | "conflict";
export interface MigrationDependencies {
  backup?(story: LegacyStory): Promise<unknown>;
  upload?(prepared: PreparedLegacyImage, story: LegacyStory): Promise<UploadedImage>;
  recordUpload?(receipt: MigrationReceipt): Promise<unknown>;
  verify?(uploaded: UploadedImage, story: LegacyStory): Promise<VerifiedStoryImage>;
  recordVerified?(verified: VerifiedStoryImage): Promise<unknown>;
  update?(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ matchedCount: number }>;
  receipt?: MigrationReceipt;
}

export const isLegacyImage = (image: unknown): image is string => typeof image === "string" && /^data:image\/[^;,]+;base64,/.test(image.slice(0, 128));
export const sourceHash = (image: string) => createHash("sha256").update(image).digest("hex");

export const prepareLegacyImage = async (image: unknown): Promise<PreparedLegacyImage> => {
  if (typeof image !== "string") throw new Error("Unsupported legacy image format");
  const comma = typeof image === "string" ? image.indexOf(",") : -1;
  const header = comma > 0 && comma < 100 ? image.slice(0, comma + 1) : "";
  const match = /^data:(image\/(?:jpeg|png|webp|gif|avif));base64,$/.exec(header);
  if (!match) throw new Error("Unsupported legacy image format");
  const encoded = image.slice(comma + 1);
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.toString("base64") !== encoded) throw new Error("Invalid Base64 image");
  const options = { animated: true, limitInputPixels: 64000000 };
  const metadata = await sharp(bytes, options).metadata();
  const formats: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "heif" };
  const mime = match[1];
  if (!mime || metadata.format !== formats[mime]) throw new Error("Image content does not match its MIME type");
  if (bytes.length <= MAX_IMAGE_SIZE) return { bytes, type: mime, compressed: false };

  const compressed = await sharp(bytes, options)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85, effort: 4 })
    .toBuffer();
  if (compressed.length > MAX_IMAGE_SIZE) throw new Error("Compressed image still exceeds 5 MB");
  return { bytes: compressed, type: "image/webp", compressed: true };
};

export const migrateLegacyStory = async (story: LegacyStory, dependencies: MigrationDependencies): Promise<{ status: MigrationStatus }> => {
  if (!isLegacyImage(story.image)) return { status: "skipped" };
  if (!/^[a-f\d]{24}$/i.test(String(story.userId))) throw new Error("Missing valid image owner");
  await dependencies.backup!(story);
  const hash = sourceHash(story.image);
  let receipt = dependencies.receipt;
  if (receipt && receipt.sourceHash !== hash) throw new Error("Upload receipt does not match original image");
  if (!receipt) {
    const prepared = await prepareLegacyImage(story.image);
    const uploaded = await dependencies.upload!(prepared, story);
    receipt = { sourceHash: hash, uploaded };
    await dependencies.recordUpload!(receipt);
  }
  const verified = await dependencies.verify!(receipt.uploaded, story);
  await dependencies.recordVerified!(verified);
  const result = await dependencies.update!(
    { _id: story._id, userId: story.userId, image: story.image },
    { $set: verified },
  );
  return { status: result.matchedCount === 1 ? "migrated" : "conflict" };
};

export const buildRestoreUpdate = (original: LegacyStory, verified: VerifiedStoryImage) => {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, string> = {};
  for (const field of metadataFields) {
    if (Object.hasOwn(original, field)) $set[field] = original[field];
    else $unset[field] = "";
  }
  return {
    filter: { _id: original._id, userId: original.userId, image: verified.image, imageFileId: verified.imageFileId },
    update: { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
  };
};

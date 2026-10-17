import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import sharp from "sharp";
import Story from "../models/storyContent.js";
import { createUploadAuthorization, resolveStoryImage } from "../services/imagekit.js";
import { buildRestoreUpdate, isLegacyImage, migrateLegacyStory, prepareLegacyImage } from "../services/image-migration.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const resumeIndex = args.indexOf("--resume");
const restoreIndex = args.indexOf("--restore");
const directoryIndex = resumeIndex >= 0 ? resumeIndex : restoreIndex;
const directoryArgument = directoryIndex >= 0 ? args[directoryIndex + 1] : undefined;
const allowed = new Set(["--apply", "--resume", "--restore", "--help"]);
const badArgs = args.some((value, index) => (directoryIndex < 0 || index !== directoryIndex + 1) && !allowed.has(value));
const legacyFilter = { image: { $regex: "^data:image/[a-zA-Z0-9.+-]{1,32};base64," } };
const projection = "_id userId image imageFileId imageWidth imageHeight";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const readOptional = async (file) => {
  try { return await readJson(file); }
  catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
};

// Exclusive, fsynced files make a failed backup stop migration before any replacement.
const writeJson = async (file, value) => {
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally { await handle.close(); }
};

const assertSameJson = async (file, value) => {
  const existing = await readOptional(file);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(value)) throw new Error("Checkpoint mismatch");
  } else await writeJson(file, value);
};

const uploadImage = async (prepared, story) => {
  const auth = createUploadAuthorization(String(story.userId), { type: prepared.type, size: prepared.bytes.length });
  const body = new FormData();
  body.append("file", new Blob([prepared.bytes], { type: prepared.type }), auth.fields.fileName);
  body.append("token", auth.token);
  for (const [key, value] of Object.entries(auth.fields)) body.append(key, value);
  const response = await fetch("https://upload.imagekit.io/api/v2/files/upload", {
    method: "POST", body, signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Image upload HTTP ${response.status}`);
  const uploaded = await response.json();
  if (!uploaded.fileId || !uploaded.url) throw new Error("Invalid upload response");
  return { fileId: uploaded.fileId, url: uploaded.url };
};

export const verifyImage = async (uploaded, story) => {
  const verified = await resolveStoryImage({ image: uploaded.url, imageFileId: uploaded.fileId }, String(story.userId));
  const url = new URL(verified.image);
  url.searchParams.set("tr", "w-800,q-80,f-auto");
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("CDN image verification failed");
  const bytes = Buffer.from(await response.arrayBuffer());
  await sharp(bytes).metadata();
  return verified;
};

const main = async () => {
  if (args.includes("--help")) {
    console.log("Usage: npm run migrate:images -- [--apply] [--resume <backup-directory> | --restore <backup-directory>]");
    return;
  }
  if (badArgs || (directoryIndex >= 0 && (!directoryArgument || directoryArgument.startsWith("--"))) || (resumeIndex >= 0 && restoreIndex >= 0)) {
    throw new Error("Invalid arguments; use --help");
  }
  if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const identity = {
    database: mongoose.connection.name,
    collection: Story.collection.collectionName,
    serverHash: createHash("sha256").update(new URL(process.env.MONGO_URI).host).digest("hex"),
  };
  let directory;
  let manifest;
  if (directoryArgument) {
    directory = path.resolve(directoryArgument);
    manifest = await readJson(path.join(directory, "manifest.json"));
    if (manifest.version !== 1 || Object.entries(identity).some(([key, value]) => manifest[key] !== value)) {
      throw new Error("Backup does not match the connected database");
    }
    if (!Array.isArray(manifest.ids) || manifest.ids.some((id) => !/^[a-f\d]{24}$/i.test(id))) throw new Error("Invalid backup manifest");
  } else if (apply) {
    const root = path.resolve(".image-migrations");
    await mkdir(root, { recursive: true, mode: 0o700 });
    directory = await mkdtemp(path.join(root, "run-"));
    manifest = { version: 1, ...identity, createdAt: new Date().toISOString(), ids: [] };
    for await (const doc of Story.find(legacyFilter).select(projection).lean().cursor({ batchSize: 1 })) {
      const original = JSON.parse(JSON.stringify(doc));
      const id = String(doc._id);
      await writeJson(path.join(directory, `${id}.original.json`), original);
      manifest.ids.push(id);
    }
    // The complete original snapshot is durable before the first ImageKit upload.
    await writeJson(path.join(directory, "manifest.json"), manifest);
    console.log(`Backup saved: ${directory}`);
  }

  const counts = { scanned: 0, eligible: 0, migrated: 0, restored: 0, skipped: 0, conflict: 0, failed: 0, compressed: 0, originalImageFieldBytes: 0, preparedImageBytes: 0 };
  if (!directory) {
    for await (const doc of Story.find(legacyFilter).select(projection).lean().cursor({ batchSize: 1 })) {
      counts.scanned++;
      counts.originalImageFieldBytes += Buffer.byteLength(doc.image);
      try {
        if (!mongoose.Types.ObjectId.isValid(doc.userId)) throw new Error("Missing owner");
        const prepared = await prepareLegacyImage(doc.image);
        counts.eligible++;
        counts.preparedImageBytes += prepared.bytes.length;
        if (prepared.compressed) counts.compressed++;
      } catch {
        counts.failed++;
        console.error(`Preflight failed for story ${doc._id}; original image unchanged.`);
      }
    }
  } else {
    for (const id of manifest.ids) {
      counts.scanned++;
      try {
        const originalFile = path.join(directory, `${id}.original.json`);
        const original = await readJson(originalFile);
        if (String(original._id) !== id || !isLegacyImage(original.image)) throw new Error("Invalid original backup");
        counts.originalImageFieldBytes += Buffer.byteLength(original.image);
        const current = await Story.findById(id).select(projection).lean();
        if (restoreIndex >= 0) {
          const verified = await readOptional(path.join(directory, `${id}.verified.json`));
          if (!current || !verified) { counts.skipped++; continue; }
          const { filter, update } = buildRestoreUpdate(original, verified);
          if (current.image !== verified.image || current.imageFileId !== verified.imageFileId || String(current.userId) !== original.userId) {
            counts.conflict++; continue;
          }
          counts.eligible++;
          if (apply) {
            const result = await Story.updateOne(filter, update, { runValidators: true });
            counts[result.matchedCount === 1 ? "restored" : "conflict"]++;
          }
        } else {
          if (!current || !isLegacyImage(current.image)) { counts.skipped++; continue; }
          if (current.image !== original.image || String(current.userId) !== original.userId) { counts.conflict++; continue; }
          counts.eligible++;
          if (!apply) {
            await prepareLegacyImage(original.image);
            continue;
          }
          const result = await migrateLegacyStory(original, {
            backup: async () => assertSameJson(originalFile, original),
            receipt: await readOptional(path.join(directory, `${id}.uploaded.json`)),
            upload: uploadImage,
            recordUpload: (receipt) => writeJson(path.join(directory, `${id}.uploaded.json`), receipt),
            verify: verifyImage,
            recordVerified: (verified) => assertSameJson(path.join(directory, `${id}.verified.json`), verified),
            update: (filter, update) => Story.updateOne(filter, update, { runValidators: true }),
          });
          counts[result.status]++;
          console.log(`Story ${id}: ${result.status}`);
        }
      } catch (error) {
        counts.failed++;
        // Never log a DB/provider error body, original image, credential or raw request.
        console.error(`Story ${id}: failed (${error.name}); original backup retained.`);
      }
    }
  }
  console.log(JSON.stringify({ mode: apply ? (restoreIndex >= 0 ? "restore" : "apply") : "dry-run", ...counts }, null, 2));
  if (counts.failed || counts.conflict) process.exitCode = 1;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    console.error(`Image migration stopped (${error.name}). Check configuration, network, arguments and backup permissions. No credentials or image data were logged.`);
    process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
}

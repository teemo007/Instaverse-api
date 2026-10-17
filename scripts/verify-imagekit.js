import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createUploadAuthorization, resolveStoryImage } from "../services/imagekit.js";

// This probe writes only its own temporary image and removes it in finally.
const userId = `verification-${randomUUID()}`;
const uploadedFileIds = [];
let step = "authorize upload";
const privateHeaders = () => ({
  Authorization: `Basic ${Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY?.trim()}:`).toString("base64")}`,
});

try {
  const bytes = await readFile(new URL("../../Instaverse/src/assets/Instaverse.png", import.meta.url));
  const auth = createUploadAuthorization(userId, { type: "image/png", size: bytes.length });
  const body = new FormData();
  body.append("file", new Blob([bytes], { type: "image/png" }), "imagekit-verification.png");
  body.append("token", auth.token);
  for (const [key, value] of Object.entries(auth.fields)) body.append(key, value);

  step = "upload test image";
  const upload = await fetch("https://upload.imagekit.io/api/v2/files/upload", {
    method: "POST", body, signal: AbortSignal.timeout(60000),
  });
  if (!upload.ok) throw new Error(`HTTP ${upload.status}`);
  const file = await upload.json();
  if (!file.fileId) throw new Error("Missing fileId");
  uploadedFileIds.push(file.fileId);

  step = "reject tampered upload folders";
  const tamperAuth = createUploadAuthorization(userId, { type: "image/png", size: bytes.length });
  const tamperedBody = new FormData();
  tamperedBody.append("file", new Blob([bytes], { type: "image/png" }), "imagekit-verification.png");
  tamperedBody.append("token", tamperAuth.token);
  for (const [key, value] of Object.entries(tamperAuth.fields)) tamperedBody.append(key, value);
  tamperedBody.set("folder", `${tamperAuth.fields.folder}-tampered`);
  const tampered = await fetch("https://upload.imagekit.io/api/v2/files/upload", {
    method: "POST", body: tamperedBody, signal: AbortSignal.timeout(30000),
  });
  if (tampered.ok) {
    const unexpected = await tampered.json();
    if (unexpected.fileId) uploadedFileIds.push(unexpected.fileId);
    throw new Error("The provider accepted modified signed fields");
  }
  if (![400, 401, 403].includes(tampered.status)) throw new Error(`HTTP ${tampered.status}`);
  console.log("ImageKit rejected a modified upload folder.");

  step = "verify image ownership and metadata";
  const image = await resolveStoryImage({ image: file.url, imageFileId: file.fileId }, userId);
  console.log(`ImageKit upload and metadata verification passed (${image.imageWidth} × ${image.imageHeight}).`);

  step = "load optimized image through CDN";
  const cdn = await fetch(`${image.image}?tr=w-800,q-80,f-auto`, { signal: AbortSignal.timeout(30000) });
  if (!cdn.ok) throw new Error(`HTTP ${cdn.status}`);
  if (!cdn.headers.get("content-type")?.startsWith("image/")) throw new Error("Unexpected content type");
  await cdn.arrayBuffer();
  console.log("Optimized CDN image retrieval passed.");
} catch (error) {
  const status = /^HTTP \d+$/.test(error.message) ? ` (${error.message})` : "";
  console.error(`ImageKit verification failed at: ${step}${status}. Check server configuration and network access.`);
  process.exitCode = 1;
} finally {
  for (const uploadedFileId of uploadedFileIds) {
    try {
      const cleanup = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(uploadedFileId)}`, {
        method: "DELETE", headers: privateHeaders(), signal: AbortSignal.timeout(15000),
      });
      if (!cleanup.ok) throw new Error();
      console.log("Temporary verification image removed from ImageKit.");
    } catch {
      console.error(`Unable to remove verification file ${uploadedFileId}. Remove imagekit-verification from the verification folder in ImageKit.`);
      process.exitCode = 1;
    }
  }
}

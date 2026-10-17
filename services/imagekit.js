import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export class ImageKitError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const getConfig = () => {
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY?.trim();
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT?.trim().replace(/\/+$/, "");
  if (!publicKey || !privateKey || !urlEndpoint) {
    throw new ImageKitError("Image uploads are unavailable. Configure IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT on the server.", 503);
  }
  try {
    if (new URL(urlEndpoint).protocol !== "https:") throw new Error();
  } catch {
    throw new ImageKitError("Configure a valid HTTPS IMAGEKIT_URL_ENDPOINT on the server.", 503);
  }
  return { publicKey, privateKey, urlEndpoint };
};

const imageFolder = (userId) => `/instaverse/stories/${userId}`;

export const createUploadAuthorization = (userId, input) => {
  const { publicKey, privateKey } = getConfig();
  const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };
  if (!input || !Object.hasOwn(extensions, input.type) || !Number.isInteger(input.size) || input.size <= 0 || input.size > MAX_IMAGE_SIZE) {
    throw new ImageKitError("Choose a JPEG, PNG, WebP, GIF or AVIF image up to 5 MB.");
  }
  // V2 verifies these exact form fields, including folder, type and overwrite restrictions.
  const fields = {
    fileName: `${randomUUID()}.${extensions[input.type]}`,
    folder: imageFolder(userId),
    useUniqueFileName: "true",
    overwriteFile: "false",
    isPrivateFile: "false",
    checks: `"file.size" <= ${MAX_IMAGE_SIZE} AND "file.mime" = "${input.type}"`,
  };
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = jwt.sign({ ...fields, iat: issuedAt }, privateKey, {
    algorithm: "HS256", expiresIn: 300, keyid: publicKey,
  });
  return { token, expire: issuedAt + 300, fields };
};

export const resolveStoryImage = async (input, userId, currentStory) => {
  // Caption-only edits must work for existing Base64 images and during provider outages.
  if (currentStory && (input.image === undefined || input.image === currentStory.image)) {
    return {
      image: currentStory.image,
      imageFileId: currentStory.imageFileId,
      imageWidth: currentStory.imageWidth,
      imageHeight: currentStory.imageHeight,
    };
  }

  if (typeof input.imageFileId !== "string" || !/^[a-f\d]{24}$/i.test(input.imageFileId)) {
    throw new ImageKitError("Upload an image to ImageKit before saving the story.");
  }

  const { privateKey, urlEndpoint } = getConfig();
  let response;
  try {
    response = await fetch(`https://api.imagekit.io/v1/files/${input.imageFileId}/details`, {
      headers: { Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ImageKitError("Unable to verify the uploaded image. Please try again.", 502);
  }
  if (!response.ok) {
    throw new ImageKitError(
      response.status === 404 ? "The uploaded image could not be found. Please upload it again." : "Unable to verify the uploaded image. Please try again.",
      response.status === 404 ? 400 : 502,
    );
  }
  let file;
  try {
    file = await response.json();
  } catch {
    throw new ImageKitError("Invalid response from the image provider. Please try again.", 502);
  }
  if (typeof file.filePath !== "string" || !file.filePath.startsWith(`${imageFolder(userId)}/`)) {
    throw new ImageKitError("This image does not belong to your upload folder.", 403);
  }
  if (
    file.fileId !== input.imageFileId || file.fileType !== "image" ||
    !/\.(jpe?g|png|webp|gif|avif)$/i.test(file.name ?? "") ||
    !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_IMAGE_SIZE ||
    file.isPrivateFile || file.isPublished === false ||
    !Number.isFinite(file.width) || file.width <= 0 ||
    !Number.isFinite(file.height) || file.height <= 0
  ) {
    throw new ImageKitError("Use a public JPEG, PNG, WebP, GIF or AVIF image up to 5 MB.");
  }
  const encodedPath = file.filePath.split("/").map(encodeURIComponent).join("/");
  return {
    image: `${urlEndpoint}${encodedPath}`,
    imageFileId: file.fileId,
    imageWidth: file.width,
    imageHeight: file.height,
  };
};

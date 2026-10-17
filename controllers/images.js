import { createUploadAuthorization, ImageKitError } from "../services/imagekit.js";

export const getUploadAuthorization = (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ message: "Sign in before uploading an image." });
  }
  res.set("Cache-Control", "no-store");
  try {
    return res.json(createUploadAuthorization(req.userId, req.body));
  } catch (error) {
    return res.status(error instanceof ImageKitError ? error.status : 500).json({
      message: error instanceof ImageKitError ? error.message : "Unable to authorize the image upload.",
    });
  }
};

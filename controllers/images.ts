import { createUploadAuthorization, ImageKitError } from "../services/imagekit.js";
import type { RequestHandler } from "express";

export const getUploadAuthorization: RequestHandler = (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ message: "Sign in before uploading an image." });
  }
  res.set("Cache-Control", "no-store");
  try {
    return res.json(createUploadAuthorization(req.userId, req.body));
  } catch (error) {
    if (error instanceof ImageKitError) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
};

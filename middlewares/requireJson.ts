import type { RequestHandler } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const requireJson: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method.toUpperCase()) || req.is("application/json")) {
    return next();
  }

  return res.status(415).json({
    message: "Content-Type must be application/json.",
    code: "CONTENT_TYPE_REQUIRED",
  });
};

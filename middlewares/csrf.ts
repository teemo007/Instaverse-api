import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

import { getAllowedOrigins } from "../config/allowedOrigins.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const matches = (received: string, expected: string): boolean => {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes);
};

export const requireCsrf: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  const origin = req.get("origin");
  const token = req.get("x-csrf-token");
  const expectedToken = req.authSession?.csrfToken;
  if (
    !origin ||
    !getAllowedOrigins().includes(origin) ||
    !token ||
    !expectedToken ||
    !matches(token, expectedToken)
  ) {
    return res.status(403).json({
      message: "Request verification failed.",
      code: "CSRF_INVALID",
    });
  }

  next();
};

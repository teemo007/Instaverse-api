import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";

import Session, { type SessionDocument } from "../models/session.js";

export const SESSION_COOKIE_NAME = "instaverse_session";
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const SESSION_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

const generateToken = (): string => randomBytes(32).toString("hex");

const isSessionToken = (value: unknown): value is string =>
  typeof value === "string" && SESSION_TOKEN_PATTERN.test(value);

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
});

export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const createSession = async (
  userId: SessionDocument["userId"] | string,
): Promise<{ sessionToken: string; csrfToken: string }> => {
  const sessionToken = generateToken();
  const csrfToken = generateToken();
  const now = new Date();

  await Session.create({
    userId,
    tokenHash: hashSessionToken(sessionToken),
    csrfToken,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });

  return { sessionToken, csrfToken };
};

export const resolveSession = async (
  sessionToken: string,
  now = new Date(),
): Promise<SessionDocument | null> => {
  if (!isSessionToken(sessionToken)) {
    return null;
  }

  return Session.findOne({
    tokenHash: hashSessionToken(sessionToken),
    expiresAt: { $gt: now },
  });
};

export const deleteSession = async (sessionToken: string): Promise<void> => {
  if (!isSessionToken(sessionToken)) {
    return;
  }

  await Session.deleteOne({ tokenHash: hashSessionToken(sessionToken) });
};

export const setSessionCookie = (res: Response, token: string): void => {
  res.cookie(SESSION_COOKIE_NAME, token, cookieOptions());
};

export const clearSessionCookie = (res: Response): void => {
  res.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
};

export const readSessionCookie = (req: Request): string | undefined => {
  const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
  return isSessionToken(token) ? token : undefined;
};

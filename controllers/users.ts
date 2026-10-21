import bcrypt from "bcryptjs";
import type { RequestHandler, Response } from "express";
import type { HydratedDocument } from "mongoose";

import Session from "../models/session.js";
import User, { type IUser } from "../models/user.js";
import {
  findUserForPassword,
  normalizeEmail,
  toPublicUser,
  validatePassword,
} from "../services/authValidation.js";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  hashSessionToken,
  readSessionCookie,
  resolveSession,
  setSessionCookie,
} from "../services/session.js";

const DUMMY_PASSWORD_HASH =
  "$2a$12$GCGP94Cwnqjk19J1NMZn5uoG37ZVtrCj3w4xMT9g1qLvVQ20HG742";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthErrorCode =
  | "EMAIL_ALREADY_REGISTERED"
  | "INVALID_CREDENTIALS"
  | "UNAUTHENTICATED"
  | "VALIDATION_FAILED";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sendAuthError = (
  res: Response,
  status: number,
  message: string,
  code: AuthErrorCode,
) => res.status(status).json({ message, code });

const isValidEmail = (value: unknown): value is string =>
  typeof value === "string" && EMAIL_PATTERN.test(normalizeEmail(value));

const isValidSignupPassword = (value: unknown): value is string => {
  try {
    validatePassword(value);
    return true;
  } catch {
    return false;
  }
};

const issueSession = async (
  res: Response,
  user: HydratedDocument<IUser>,
  status: number,
) => {
  const { sessionToken, csrfToken } = await createSession(user._id);
  setSessionCookie(res, sessionToken);
  return res.status(status).json({ user: toPublicUser(user), csrfToken });
};

const signin: RequestHandler = async (req, res, next) => {
  try {
    const body = isRecord(req.body) ? req.body : {};
    const email = body.email;
    const password = body.password;

    if (
      !isValidEmail(email) ||
      typeof password !== "string" ||
      password.length < 1 ||
      password.length > 128
    ) {
      return sendAuthError(
        res,
        401,
        "Email or password is incorrect.",
        "INVALID_CREDENTIALS",
      );
    }

    const user = await findUserForPassword(email);
    const passwordMatches = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !user.password || !passwordMatches) {
      return sendAuthError(
        res,
        401,
        "Email or password is incorrect.",
        "INVALID_CREDENTIALS",
      );
    }

    return issueSession(res, user, 200);
  } catch (error) {
    next(error);
  }
};

const signup: RequestHandler = async (req, res, next) => {
  try {
    const body = isRecord(req.body) ? req.body : {};
    const username =
      typeof body.username === "string" ? body.username.trim() : "";
    const email = body.email;
    const password = body.password;
    const confirmPassword = body.confirmPassword;

    if (
      username.length < 1 ||
      username.length > 50 ||
      !isValidEmail(email) ||
      !isValidSignupPassword(password) ||
      confirmPassword !== password
    ) {
      return sendAuthError(
        res,
        400,
        "Please provide a valid username, email, and matching password of 12 to 128 characters.",
        "VALIDATION_FAILED",
      );
    }

    const normalizedEmail = normalizeEmail(email);
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return sendAuthError(
        res,
        409,
        "An account already exists for this email.",
        "EMAIL_ALREADY_REGISTERED",
      );
    }

    const encryptedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      username,
      email: normalizedEmail,
      password: encryptedPassword,
    });

    return issueSession(res, user, 201);
  } catch (error) {
    next(error);
  }
};

const getSession: RequestHandler = async (req, res, next) => {
  try {
    const sessionToken = readSessionCookie(req);
    const session = sessionToken
      ? await resolveSession(sessionToken)
      : null;

    if (!session || !sessionToken) {
      clearSessionCookie(res);
      return sendAuthError(
        res,
        401,
        "Sign in required.",
        "UNAUTHENTICATED",
      );
    }

    const user = await User.findById(session.userId);
    if (!user) {
      await deleteSession(sessionToken);
      clearSessionCookie(res);
      return sendAuthError(
        res,
        401,
        "Sign in required.",
        "UNAUTHENTICATED",
      );
    }

    await Session.updateOne(
      { tokenHash: hashSessionToken(sessionToken) },
      { $set: { lastUsedAt: new Date() } },
    );

    return res.json({ user: toPublicUser(user), csrfToken: session.csrfToken });
  } catch (error) {
    next(error);
  }
};

const signout: RequestHandler = async (req, res, next) => {
  try {
    const sessionToken = readSessionCookie(req);
    if (sessionToken) {
      await deleteSession(sessionToken);
    }
    clearSessionCookie(res);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export { getSession, signin, signout, signup };

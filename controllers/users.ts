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
  GoogleIdentityError,
  type GoogleIdentity,
  verifyGoogleCredential,
} from "../services/googleIdentity.js";
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
  | "ACCOUNT_LINK_REQUIRED"
  | "EMAIL_ALREADY_REGISTERED"
  | "GOOGLE_ACCOUNT_CONFLICT"
  | "INVALID_CREDENTIALS"
  | "INVALID_GOOGLE_CREDENTIAL"
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

const readGoogleCredential = (body: Record<string, unknown>): string | null => {
  const credential = body.credential;
  return typeof credential === "string" &&
    credential.length > 0 &&
    credential.length <= 20_000
    ? credential
    : null;
};

const verifyGoogleForRequest = async (
  credential: string,
): Promise<GoogleIdentity | null> => {
  try {
    return await verifyGoogleCredential(credential);
  } catch (error) {
    if (error instanceof GoogleIdentityError) {
      return null;
    }
    throw error;
  }
};

const chooseGoogleUsername = async (
  name: string,
  email: string,
  subject: string,
): Promise<string> => {
  const fallback = email.split("@", 1)[0] || "Google user";
  const base = (name.trim().replace(/\s+/g, " ") || fallback).slice(0, 50);

  for (let sequence = 1; sequence <= 100; sequence += 1) {
    const suffix = sequence === 1 ? "" : `-${sequence}`;
    const candidate = `${base.slice(0, 50 - suffix.length)}${suffix}`;
    if (!(await User.exists({ username: candidate }))) {
      return candidate;
    }
  }

  const suffix = `-${subject.slice(-8)}`;
  return `${base.slice(0, 50 - suffix.length)}${suffix}`;
};

const isDuplicateKeyError = (error: unknown): boolean =>
  isRecord(error) && error.code === 11000;

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

const googleSignin: RequestHandler = async (req, res, next) => {
  try {
    const body = isRecord(req.body) ? req.body : {};
    const credential = readGoogleCredential(body);
    if (!credential) {
      return sendAuthError(
        res,
        400,
        "A valid Google credential is required.",
        "INVALID_GOOGLE_CREDENTIAL",
      );
    }

    const identity = await verifyGoogleForRequest(credential);
    if (!identity) {
      return sendAuthError(
        res,
        401,
        "The Google credential could not be verified.",
        "INVALID_GOOGLE_CREDENTIAL",
      );
    }

    const subjectUser = await User.findOne({ googleSubject: identity.subject });
    if (subjectUser) {
      return issueSession(res, subjectUser, 200);
    }

    const emailUser = await User.findOne({ email: identity.email });
    if (emailUser) {
      return sendAuthError(
        res,
        409,
        "Sign in with your existing password to link Google.",
        "ACCOUNT_LINK_REQUIRED",
      );
    }

    const username = await chooseGoogleUsername(
      identity.name,
      identity.email,
      identity.subject,
    );
    const user = await User.create({
      username,
      email: identity.email,
      googleSubject: identity.subject,
      emailVerifiedAt: new Date(),
    });
    return issueSession(res, user, 201);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return sendAuthError(
        res,
        409,
        "This Google account or email is already registered.",
        "GOOGLE_ACCOUNT_CONFLICT",
      );
    }
    next(error);
  }
};

const googleLink: RequestHandler = async (req, res, next) => {
  try {
    const body = isRecord(req.body) ? req.body : {};
    const credential = readGoogleCredential(body);
    const password = body.password;
    if (!credential) {
      return sendAuthError(
        res,
        400,
        "A valid Google credential is required.",
        "INVALID_GOOGLE_CREDENTIAL",
      );
    }
    if (
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

    const identity = await verifyGoogleForRequest(credential);
    if (!identity) {
      return sendAuthError(
        res,
        401,
        "The Google credential could not be verified.",
        "INVALID_GOOGLE_CREDENTIAL",
      );
    }

    const subjectUser = await User.findOne({ googleSubject: identity.subject });
    if (subjectUser) {
      return sendAuthError(
        res,
        409,
        "This Google account is already linked.",
        "GOOGLE_ACCOUNT_CONFLICT",
      );
    }

    const user = await findUserForPassword(identity.email);
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

    const update = await User.updateOne(
      { _id: user._id, googleSubject: { $exists: false } },
      {
        $set: {
          googleSubject: identity.subject,
          emailVerifiedAt: new Date(),
        },
      },
    );
    if (update.modifiedCount !== 1) {
      return sendAuthError(
        res,
        409,
        "This account could not be linked.",
        "GOOGLE_ACCOUNT_CONFLICT",
      );
    }

    return issueSession(res, user, 200);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return sendAuthError(
        res,
        409,
        "This Google account is already linked.",
        "GOOGLE_ACCOUNT_CONFLICT",
      );
    }
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

export { getSession, googleLink, googleSignin, signin, signout, signup };

import type { RequestHandler } from "express";

import User from "../models/user.js";
import {
  clearSessionCookie,
  deleteSession,
  readSessionCookie,
  resolveSession,
} from "../services/session.js";

const rejectUnauthenticated = (res: Parameters<RequestHandler>[1]) => {
  clearSessionCookie(res);
  return res.status(401).json({
    message: "Sign in required.",
    code: "UNAUTHENTICATED",
  });
};

const authentication: RequestHandler = async (req, res, next) => {
  try {
    const token = readSessionCookie(req);
    if (!token) {
      return rejectUnauthenticated(res);
    }

    const session = await resolveSession(token);
    if (!session) {
      return rejectUnauthenticated(res);
    }

    const userExists = await User.exists({ _id: session.userId });
    if (!userExists) {
      await deleteSession(token);
      return rejectUnauthenticated(res);
    }

    req.userId = String(session.userId);
    req.authSession = {
      token,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    };
    next();
  } catch (error) {
    next(error);
  }
};

export default authentication;

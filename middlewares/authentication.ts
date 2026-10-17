import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";

const authentication: RequestHandler = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (token) {
      const decodeData = jwt.verify(token, process.env.JWT_SECRET ?? "");

      if (typeof decodeData !== "string" && typeof decodeData.uid === "string") {
        req.userId = decodeData.uid;
      }
    }
    next();
  } catch (error: unknown) {
    console.log("Error:", error instanceof Error ? error.message : "Unknown error")
    return res.status(403).json({ message: 'Invalid token' });
  }
};

export default authentication;

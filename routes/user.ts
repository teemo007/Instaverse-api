import { Router } from "express";
import authentication from "../middlewares/authentication.js";
import { requireCsrf } from "../middlewares/csrf.js";
import {
  authRateLimit,
  passwordRateLimit,
} from "../middlewares/rateLimits.js";
import { requireJson } from "../middlewares/requireJson.js";
import {
  getSession,
  googleLink,
  googleSignin,
  signin,
  signout,
  signup,
} from "../controllers/users.js";

const router = Router();

router.post("/signin", requireJson, passwordRateLimit, signin);
router.post("/signup", requireJson, authRateLimit, signup);
router.post("/google", requireJson, authRateLimit, googleSignin);
router.post("/google/link", requireJson, passwordRateLimit, googleLink);
router.get("/session", getSession);
router.post("/signout", authentication, requireCsrf, requireJson, signout);

export default router;

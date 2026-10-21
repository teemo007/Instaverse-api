import { Router } from "express";
import {
  getSession,
  googleLink,
  googleSignin,
  signin,
  signout,
  signup,
} from "../controllers/users.js";

const router = Router();

router.post("/signin", signin);
router.post("/signup", signup);
router.post("/google", googleSignin);
router.post("/google/link", googleLink);
router.get("/session", getSession);
router.post("/signout", signout);

export default router;

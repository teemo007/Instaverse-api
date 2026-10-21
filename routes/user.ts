import { Router } from "express";
import {
  getSession,
  signin,
  signout,
  signup,
} from "../controllers/users.js";

const router = Router();

router.post("/signin", signin);
router.post("/signup", signup);
router.get("/session", getSession);
router.post("/signout", signout);

export default router;

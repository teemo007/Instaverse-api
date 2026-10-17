import { Router } from "express";
import { getUploadAuthorization } from "../controllers/images.js";
import authentication from "../middlewares/authentication.js";

const router = Router();

router.post("/upload-auth", authentication, getUploadAuthorization);

export default router;

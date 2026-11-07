import { Router } from "express";
import { getUploadAuthorization } from "../controllers/images.js";
import authentication from "../middlewares/authentication.js";
import { requireCsrf } from "../middlewares/csrf.js";
import { requireJson } from "../middlewares/requireJson.js";

const router = Router();

router.post("/upload-auth", authentication, requireCsrf, requireJson, getUploadAuthorization);

export default router;

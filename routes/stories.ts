import { Router } from "express";
import {
  getStories,
  createStory,
  updateStory,
  deleteStory,
  likeStory,
  //createComment,
} from "../controllers/stories.js";
import authentication from "../middlewares/authentication.js";
import { requireCsrf } from "../middlewares/csrf.js";
import { requireJson } from "../middlewares/requireJson.js";

const router = Router();

router.get("/", getStories);
router.post("/", authentication, requireCsrf, requireJson, createStory);
router.patch("/:id", authentication, requireCsrf, requireJson, updateStory);
router.delete("/:id", authentication, requireCsrf, requireJson, deleteStory);
router.patch("/:id/likeStroy", authentication, requireCsrf, requireJson, likeStory);
//router.post("/:id/createComment", authentication, createComment);


export default router;

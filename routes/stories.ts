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

const router = Router();

router.get("/", getStories);
router.post("/", authentication, createStory);
router.patch("/:id", authentication, updateStory);
router.delete("/:id", authentication, deleteStory);
router.patch("/:id/likeStroy", authentication, likeStory);
//router.post("/:id/createComment", authentication, createComment);


export default router;

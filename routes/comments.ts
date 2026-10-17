import { Router } from "express";
import CommentController from "../controllers/comments.js";
import authentication from "../middlewares/authentication.js";

const router = Router();


router.post("/:story_id/add", authentication, CommentController.addComment);
router.post("/:story_id/reply/:parentCommentId", authentication, CommentController.addReplyToCommenet);
router.get("/:story_id", authentication, CommentController.getCommentsForStory);
router.get("/replies/:comment_id", authentication, CommentController.getRepliesForComment);


export default router;


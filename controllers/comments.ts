import mongoose from "mongoose";
import Comment from "../models/comment.js";
import Story from "../models/storyContent.js";
import type { RequestHandler, Response } from "express";

export const COMMENT_MAX_LENGTH = 100;

// Only the comment text is client-controlled; ids, dates and threading are set here.
const readCommentContent = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const content = (body as Record<string, unknown>).content;
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  return trimmed.length >= 1 && trimmed.length <= COMMENT_MAX_LENGTH ? trimmed : null;
};

const rejectInvalidContent = (res: Response) =>
  res.status(400).json({
    message: `Write a comment of 1 to ${COMMENT_MAX_LENGTH} characters.`,
    code: "VALIDATION_FAILED",
  });

const CommentController: Record<
  "addComment" | "addReplyToCommenet" | "getCommentsForStory" | "getRepliesForComment",
  RequestHandler
> = {
  addComment: async (req, res, next) => {
    const { story_id } = req.params;

    if (!req.userId) return res.json({ message: "Unauthenticated User" });

    if (!story_id || !mongoose.Types.ObjectId.isValid(story_id)) {
      return res.status(404).send("This id doesn't belong to any story");
    }

    const content = readCommentContent(req.body);
    if (content === null) return rejectInvalidContent(res);

    try {
      if (!(await Story.exists({ _id: story_id }))) {
        return res.status(404).json({ message: "Story not found." });
      }

      const newComment = new Comment({
        content,
        story_id: story_id,
        user_id: req.userId,
      });
      const savedComment = await newComment.save();
      const populatedComment = await Comment.findById(
        savedComment._id
      ).populate("user_id", "username");

      await Story.findByIdAndUpdate(
        story_id,
        { $push: { comments: savedComment._id } },
        { new: true }
      );

      res.status(201).json(populatedComment);
    } catch (error: unknown) {
      next(error);
    }
  },
  // Add a reply to an existing comment
  addReplyToCommenet: async (req, res, next) => {
    const { story_id, parentCommentId } = req.params;
    const userId = req.userId; // user_id
    //console.log("parentCommentId",parentCommentId)
    if (!req.userId) return res.json({ message: "Unauthenticated User" });

    // Validate the story_id and parentCommentId
    if (!story_id || !mongoose.Types.ObjectId.isValid(story_id)) {
      return res.status(400).json({ message: "Invalid story ID" });
    }

    if (!parentCommentId || !mongoose.Types.ObjectId.isValid(parentCommentId)) {
      return res.status(404).json({ message: "Parent comment not found" });
    }

    const content = readCommentContent(req.body);
    if (content === null) return rejectInvalidContent(res);

    try {
      // The parent must exist and belong to the same story the reply is posted under.
      const parent = await Comment.exists({ _id: parentCommentId, story_id });
      if (!parent) {
        return res.status(404).json({ message: "Parent comment not found" });
      }

      const reply = new Comment({
        story_id,
        user_id: userId,
        content,
        parentId: parentCommentId,
      });
      const savedReply = await reply.save();
      const populatedReply = await Comment.findById(savedReply._id)
        .populate({
          path: "user_id",
          select: "-_id username",
        })
        .populate({
          path: "parentId",
          select: "-_id user_id",
          populate: {
            path: "user_id", 
            select: "-_id username", 
          },
        });

      if (!populatedReply) return res.status(500).json({ message: "Error adding reply: Unknown error" });
      const rawReply = populatedReply.toObject() as unknown as Record<string, unknown> & {
        parentId?: { user_id?: { username?: string } | null } | null;
      };
      const plainReply: Record<string, unknown> = {
        ...rawReply,
        // The parent's author may have been deleted; mirror getRepliesForComment.
        parentId: rawReply.parentId?.user_id?.username ?? "Unknown",
      };

      await Comment.findByIdAndUpdate(
        parentCommentId,
        { $push: { replies: savedReply._id } }
        //{ new: true } // Return the updated document
      );

      res.status(201).json(plainReply);
    } catch (error: unknown) {
      next(error);
    }
  },
  getCommentsForStory: async (req, res, next) => {
    const { story_id } = req.params; 

    if (!req.userId) return res.json({ message: "Unauthenticated User" });

    if (!story_id || !mongoose.Types.ObjectId.isValid(story_id)) {
      return res.status(404).send("This id doesn't belong to any story");
    }

    try {
      const comments = await Comment.find({ story_id }).populate(
        "user_id",
        "username"
      );

      res.status(200).json(comments);
    } catch (error: unknown) {
      next(error);
    }
  },
  getRepliesForComment: async (req, res, next) => {
    const { comment_id } = req.params;

    if (!req.userId) return res.json({ message: "Unauthenticated User" });

    if (!comment_id || !mongoose.Types.ObjectId.isValid(comment_id)) {
      return res.status(404).send("This id doesn't belong to any comment");
    }

    try {
      const comment = await Comment.findById(comment_id)
        .populate({
          path: "replies",
          populate: {
            path: "user_id",
            select: "-_id username",
          },
        })
        .populate({
          path: "user_id",
          select: "-_id username",
        });

      if (!comment) return res.status(404).send("This id doesn't belong to any comment");
      const plainReplies = comment.replies.map((reply) => (reply as unknown as { toObject(): Record<string, unknown> }).toObject());

      const enrichedReplies = plainReplies.map((reply) => ({
        ...reply,
        parentId: comment.user_id ? (comment.user_id as unknown as { username: string }).username : "Unknown",
      }));

      res.status(200).json(enrichedReplies);
    } catch (error: unknown) {
      next(error);
    }
  },
};

export default CommentController;

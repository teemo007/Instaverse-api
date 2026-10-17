import mongoose from "mongoose";
import Comment from "../models/comment.js";
import Story from "../models/storyContent.js";
import type { RequestHandler } from "express";

const CommentController: Record<
  "addComment" | "addReplyToCommenet" | "getCommentsForStory" | "getRepliesForComment",
  RequestHandler
> = {
  addComment: async (req, res) => {
    const { story_id } = req.params;
    const content = req.body;

    if (!req.userId) return res.json({ message: "Unauthenticated User" });

    if (!story_id || !mongoose.Types.ObjectId.isValid(story_id)) {
      return res.status(404).send("This id doesn't belong to any story");
    }

    try {
      const newComment = new Comment({
        ...content,
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
      res
        .status(500)
        .json({ message: `Error adding comment: ${error instanceof Error ? error.message : "Unknown error"}` });
    }
  },
  // Add a reply to an existing comment
  addReplyToCommenet: async (req, res) => {
    const { story_id, parentCommentId } = req.params;
    const { content } = req.body;
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

    try {
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
      const rawReply = populatedReply.toObject() as unknown as Record<string, unknown> & { parentId: { user_id: { username: string } } };
      const plainReply: Record<string, unknown> = {
        ...rawReply,
        parentId: rawReply.parentId.user_id.username,
      };

      await Comment.findByIdAndUpdate(
        parentCommentId,
        { $push: { replies: savedReply._id } }
        //{ new: true } // Return the updated document
      );

      res.status(201).json(plainReply);
    } catch (error: unknown) {
      res.status(500).json({ message: `Error adding reply: ${error instanceof Error ? error.message : "Unknown error"}` });
    }
  },
  getCommentsForStory: async (req, res) => {
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
      res
        .status(500)
        .json({ message: `Error retrieving comments: ${error instanceof Error ? error.message : "Unknown error"}` });
    }
  },
  getRepliesForComment: async (req, res) => {
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
      res
        .status(500)
        .json({ message: `Error retrieving replies: ${error instanceof Error ? error.message : "Unknown error"}` });
    }
  },
};

export default CommentController;

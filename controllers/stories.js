import mongoose from "mongoose";
import Story from "../models/storyContent.js";
import Comment from "../models/comment.js";
import { ImageKitError, resolveStoryImage } from "../services/imagekit.js";

const storyWriteError = (res, error) => {
  if (error instanceof ImageKitError) {
    return res.status(error.status).json({ message: error.message });
  }
  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ message: "Provide a caption, username and valid image for the story." });
  }
  return res.status(500).json({ message: "Unable to save the story. Please try again." });
};

const getStories = async (req, res) => {
  try {
    const story = await Story.find({}).populate({
      path: "comments",
      populate: {
        path: "user_id",
        select: "username",
      },
    });

    res.status(200).json(story);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

const createStory = async (req, res) => {
  if (!req.userId) return res.status(401).json({ message: "Sign in before sharing a story." });
  try {
    const { caption, username, tags } = req.body;
    const image = await resolveStoryImage(req.body, req.userId);
    const newStory = new Story({
      caption, username, tags, ...image,
      userId: req.userId,
      postDate: new Date().toISOString(),
    });
    await newStory.save();
    res.status(201).json(newStory);
  } catch (error) {
    return storyWriteError(res, error);
  }
};

const updateStory = async (req, res) => {
  if (!req.userId) return res.status(401).json({ message: "Sign in before editing a story." });
  const { id: _id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).send("This id doesn't belong to any story");
  }

  try {
    const story = await Story.findById(_id);
    if (!story) return res.status(404).json({ message: "Story not found." });
    if (String(story.userId) !== req.userId) {
      return res.status(403).json({ message: "You can only edit your own stories." });
    }
    const image = await resolveStoryImage(req.body, req.userId, story);
    const changes = { ...image };
    for (const field of ["caption", "tags"]) {
      if (Object.hasOwn(req.body, field)) changes[field] = req.body[field];
    }
    story.set(changes);
    await story.save();
    res.json(story);
  } catch (error) {
    return storyWriteError(res, error);
  }
};
const deleteStory = async (req, res) => {
  if (!req.userId) return res.status(401).json({ message: "Sign in before deleting a story." });
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).send("This id doesnt belong to any story");
  }

  try {
    const story = await Story.findById(id);
    if (!story) return res.status(404).json({ message: "Story not found." });
    if (String(story.userId) !== req.userId) {
      return res.status(403).json({ message: "You can only delete your own stories." });
    }
    await Story.findByIdAndDelete(id);
    res.json({ message: "Story deleted successfully" });
  } catch {
    res.status(500).json({ message: "Unable to delete the story. Please try again." });
  }
};

const likeStory = async (req, res) => {
  const { id } = req.params;

  if (!req.userId) return res.json({ message: "Unauthenticated User" });

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).send("This id doesn't belong to any story");
  }

  const story = await Story.findById(id);
  const index = story.likes.findIndex((id) => id === String(req.userId));
  if (index === -1) {
    story.likes.push(req.userId);
  } else {
    story.likes = story.likes.filter((id) => id !== String(req.userId));
  }

  const updateStory = await Story.findByIdAndUpdate(id, story, { new: true });
  res.json(updateStory);
};

const createComment = async (req, res) => {
  const { id } = req.params;

  const content = req.body;

  if (!req.userId) return res.json({ message: "Unauthenticated User" });

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).send("This id doesn't belong to any story");
  }
  const newComment = await Comment.create({
    ...content,
    story_id: id,
    user_id: req.userId,
    createdAt: new Date().toISOString(),
  });
  try {
    await newComment.save();
    const story = await Story.findById(id);

    story.comments.push(newComment);

    const updateStory = await Story.findByIdAndUpdate(id, story, {
      new: true,
    }).populate({
      path: "comments",
      populate: {
        path: "user_id",
        select: "username",
      },
    });
    console.log(updateStory);

    res.status(201).json(updateStory);
  } catch (error) {
    res.status(409).json({ message: error.message });
  }

  res.json(updateStory);
};

export {
  getStories,
  createStory,
  updateStory,
  deleteStory,
  likeStory,
  //createComment,
};

import mongoose from "mongoose";
import Story from "../models/storyContent.js";
import Comment from "../models/comment.js";

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
  const body = req.body;
  const newStory = new Story({
    ...body,
    userId: req.userId,
    postDate: new Date().toISOString(),
  });
  try {
    await newStory.save();
    res.status(201).json(newStory);
  } catch (error) {
    res.status(409).json({ message: error.message });
  }
};

const updateStory = async (req, res) => {
  const { id: _id } = req.params;

  const story = req.body;

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(404).send("This id doesn't belong to any story");
  }

  const updatedStory = await Story.findByIdAndUpdate(_id, story, { new: true });

  res.json(updatedStory);
};
const deleteStory = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).send("This id doesnt belong to any story");
  }

  await Story.findByIdAndDelete(id);

  res.json({ message: "Story deleted successfully" });
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

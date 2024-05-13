import mongoose from "mongoose";

const storySchema = mongoose.Schema({
  caption: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  image: { type: String, required: true },
  tags: String,
  likes: { type: [String], default: [] },
  postDate: { type: Date, default: new Date() },
  comments: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "Comment",
    default: [],
  },
});

export default mongoose.model("Story", storySchema);

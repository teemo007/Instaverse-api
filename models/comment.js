import mongoose from "mongoose";

const commentSchema = mongoose.Schema({
  story_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Story",
    required: true,
  },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", require: true },
  content: { type: String, require: true, maxLength: 100 },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null,
  },
  replies: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
    },
  ],
  
});

export default mongoose.model("Comment", commentSchema);

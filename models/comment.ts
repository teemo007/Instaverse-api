import mongoose from "mongoose";

export interface IComment {
  story_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  content: string;
  createdAt: Date;
  parentId: mongoose.Types.ObjectId | null;
  replies: mongoose.Types.ObjectId[];
}

const commentSchema = new mongoose.Schema<IComment>({
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

export default mongoose.model<IComment>("Comment", commentSchema);

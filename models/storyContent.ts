import mongoose from "mongoose";

export interface IStory {
  caption: string;
  username: string;
  userId: mongoose.Types.ObjectId;
  image: string;
  imageFileId?: string;
  imageWidth?: number;
  imageHeight?: number;
  tags?: string;
  likes: string[];
  postDate: Date;
  comments: mongoose.Types.ObjectId[];
}

const storySchema = new mongoose.Schema<IStory>({
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
  imageFileId: String,
  imageWidth: Number,
  imageHeight: Number,
  tags: String,
  likes: { type: [String], default: [] },
  postDate: { type: Date, default: new Date() },
  comments: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "Comment",
    default: [],
  },
});

export default mongoose.model<IStory>("Story", storySchema);

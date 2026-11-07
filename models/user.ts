import mongoose from "mongoose";

export interface IUser {
  username: string;
  email: string;
  password?: string;
  googleSubject?: string;
  emailVerifiedAt?: Date;
  id?: string;
}

const userSchema = new mongoose.Schema<IUser>({
  username: { type: String, trim: true, required: true },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/.+\@.+\..+/, "Please enter a valid email address"],
    required: true,
  },
  password: { type: String, required: false, select: false },
  googleSubject: { type: String, sparse: true, unique: true },
  emailVerifiedAt: { type: Date },
  id: { type: String },
});

export default mongoose.model<IUser>("User", userSchema);

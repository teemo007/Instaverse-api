import mongoose, { type HydratedDocument } from "mongoose";

export interface ISession {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  csrfToken: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

const sessionSchema = new mongoose.Schema<ISession>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  tokenHash: { type: String, required: true, unique: true },
  csrfToken: { type: String, required: true },
  createdAt: { type: Date, required: true },
  lastUsedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionDocument = HydratedDocument<ISession>;

export default mongoose.model<ISession>("Session", sessionSchema);

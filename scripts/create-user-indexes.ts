import "dotenv/config";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import User from "../models/user.js";
import { findDuplicateEmails } from "../services/authValidation.js";
import { loadUserEmails } from "./check-duplicate-emails.js";

export const createEmailIndexIfSafe = async (
  emails: readonly string[],
  createIndex: () => Promise<void>,
): Promise<boolean> => {
  if (findDuplicateEmails(emails).length > 0) {
    return false;
  }

  await createIndex();
  return true;
};

const main = async (): Promise<void> => {
  if (!process.env.MONGO_URI) {
    throw new Error("Missing MONGO_URI");
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const created = await createEmailIndexIfSafe(
      await loadUserEmails(),
      async () => {
        await User.collection.createIndex({ email: 1 }, { unique: true });
      },
    );
    if (!created) {
      throw new Error("Duplicate normalized emails prevent unique index creation.");
    }
    console.log("Unique email index is ready.");
  } finally {
    await mongoose.disconnect();
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Index creation failed.");
    process.exitCode = 1;
  });
}

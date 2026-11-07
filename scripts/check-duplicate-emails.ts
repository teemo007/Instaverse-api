import "dotenv/config";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import User from "../models/user.js";
import {
  findDuplicateEmails,
  type DuplicateEmail,
} from "../services/authValidation.js";

export const loadUserEmails = async (): Promise<string[]> => {
  const users = await User.find({}, { _id: 0, email: 1 }).lean();
  return users.map(({ email }) => email);
};

export const checkDuplicateEmails = async (): Promise<DuplicateEmail[]> =>
  findDuplicateEmails(await loadUserEmails());

const main = async (): Promise<void> => {
  if (!process.env.MONGO_URI) {
    throw new Error("Missing MONGO_URI");
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const duplicates = await checkDuplicateEmails();
    if (duplicates.length > 0) {
      console.error(JSON.stringify({ duplicateEmails: duplicates }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log("No duplicate normalized email addresses found.");
  } finally {
    await mongoose.disconnect();
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Duplicate check failed.");
    process.exitCode = 1;
  });
}

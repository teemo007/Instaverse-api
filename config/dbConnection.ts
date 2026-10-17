import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI ?? "");
    
  } catch (error) {
    console.error(
      "Connection to MongoDB failed",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
};

export default connectDB;

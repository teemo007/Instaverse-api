import dotenv from "dotenv";
import mongoose from "mongoose";

import connectDB from "./config/dbConnection.js";
import { createApp, validateProductionEnvironment } from "./createApp.js";

dotenv.config();
validateProductionEnvironment(process.env);

const app = createApp();
const port = process.env.PORT || 5001;

void connectDB();

mongoose.connection.once("open", () => {
  console.log("Connection to database has been established successfully");
  app.listen(port, () => console.log(`Server running on port: ${port}`));
});

mongoose.connection.on("error", (error) => {
  console.error("MongoDB connection error", error);
});

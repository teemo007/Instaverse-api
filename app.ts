import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import storyRoutes from "./routes/stories.js";
import userRoutes from "./routes/user.js";
import commentRoutes from "./routes/comments.js"
import imageRoutes from "./routes/images.js";
import dotenv from "dotenv";
//import corsOptions from "./config/corsOptions.js";
import connectDB from "./config/dbConnection.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";

const app = express();

dotenv.config();
const PORT = process.env.PORT || 5001;

app.use(bodyParser.json({ limit: "32mb" }));
app.use(bodyParser.urlencoded({ limit: "32mb", extended: true }));

app.use(cors({ origin: "*" }));

app.use("/stories", storyRoutes);
app.use("/user", userRoutes);
app.use("/comments", commentRoutes);
app.use("/images", imageRoutes);

app.use(notFound);
app.use(errorHandler);

connectDB();

mongoose.connection.once("open", () => {
  console.log("Connection to database has been established successfully");
  app.listen(PORT, () =>
    console.log(`Server running on port: ${PORT}`)
  );
});
mongoose.connection.on("error", (error) => {
  console.log(error);
});

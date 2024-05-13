import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import storyRoutes from "./routes/stories.js";
import userRoutes from "./routes/user.js";
import commentRoutes from "./routes/comments.js"
import dotenv from "dotenv";
import corsOptions from "./config/corsOptions.js";
import connectDB from "./config/dbConnection.js";

const app = express();

dotenv.config();
const PORT = process.env.PORT || 5001;

app.use(bodyParser.json({ limit: "32mb", extended: true }));
app.use(bodyParser.urlencoded({ limit: "32mb", extended: true }));

app.use(cors('*'));

app.use("/stories", storyRoutes);
app.use("/user", userRoutes);
app.use("/comments", commentRoutes);

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

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import corsOptions from "./config/corsOptions.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import commentRoutes from "./routes/comments.js";
import imageRoutes from "./routes/images.js";
import storyRoutes from "./routes/stories.js";
import userRoutes from "./routes/user.js";

type Environment = Record<string, string | undefined>;

export const validateProductionEnvironment = (environment: Environment): void => {
  if (environment.NODE_ENV !== "production") {
    return;
  }

  const required = ["FRONTEND_ORIGIN", "GOOGLE_CLIENT_ID"] as const;
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  }
};

export const createApp = () => {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(cookieParser());
  app.use(express.json({ limit: "32mb" }));

  app.use("/stories", storyRoutes);
  app.use("/user", userRoutes);
  app.use("/comments", commentRoutes);
  app.use("/images", imageRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

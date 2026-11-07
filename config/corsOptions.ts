import type { CorsOptions } from "cors";
import { getAllowedOrigins } from "./allowedOrigins.js";

const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    callback(null, !origin || getAllowedOrigins().includes(origin));
  },
};

export default corsOptions;

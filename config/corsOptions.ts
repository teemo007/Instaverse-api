import type { CorsOptions } from "cors";
import { isAllowedOrigin } from "./allowedOrigins.js";

const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    callback(null, !origin || isAllowedOrigin(origin));
  },
};

export default corsOptions;

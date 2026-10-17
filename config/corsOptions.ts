import allowedOrigins from "./allowedOrigins.js"
import type { CorsOptions } from "cors";

const corsOptions: CorsOptions = {
  origin: allowedOrigins
  };

export default corsOptions

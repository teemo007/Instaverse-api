import dotenv from "dotenv";

dotenv.config();

const allowedOrigins = [process.env.ORIGIN];

export default allowedOrigins;

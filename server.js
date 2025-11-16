import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import connectToMongo from "./db.js";
import userRouter from "./routes/user.js";
import adminRouter from "./routes/admin.js";

connectToMongo();

const app = express();
const port = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:8080",
  "https://the-pizza-unlimited-client-frontend-three.vercel.app",
  "https://the-pizza-unlimited-admin-frontend.vercel.app"
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS blocked"), false);
    },
    credentials: true,
    methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    allowedHeaders: "Content-Type,Authorization",
  })
);

app.options(/.*/, cors());

app.use(express.json());
app.use(clerkMiddleware());

app.use("/api", userRouter);
app.use("/api/admin", adminRouter);

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

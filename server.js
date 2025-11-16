import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import connectToMongo from './db.js';
import userRouter from './routes/user.js';
import adminRouter from './routes/admin.js';

connectToMongo();

const app = express();
const port = process.env.PORT || 5000;

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:8080",
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL,
  "https://azurewebsites.net",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());
app.use(clerkMiddleware());

app.use('/api', userRouter);
app.use('/api/admin', adminRouter);

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

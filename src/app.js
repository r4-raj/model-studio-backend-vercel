import express from "express";
import cors from "cors";
import generateRouter from "./routes/generate.js";

const app = express();

app.use(
  cors({
    origin: "*", // Keeping permissive CORS for now, assuming external domain is required
  })
);

app.use(express.json({ limit: '50mb' })); // Ensure body parser handles large image data

// health check
app.get("/", (req, res) => {
  res.send("Model Studio backend is running");
});
app.options("*", cors());

// 🚨 FIX HERE: Change the route base path to /api
// This allows generateRouter to define the POST route at /generate-image
app.use("/api", generateRouter);

export default app;
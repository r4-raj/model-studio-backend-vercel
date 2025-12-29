import express from "express";
import cors from "cors";
import generateRouter from "./routes/generate.js";

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "50mb" }));

// health check
app.get("/", (req, res) => {
  res.send("Model Studio backend is running 🚀");
});

// API routes
app.use("/api", generateRouter);

export default app;

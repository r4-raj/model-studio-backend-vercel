import express from "express";
import multer from "multer";
import { generateImage } from "../controllers/generateController.js";

const router = express.Router();
// Stores file in memory, as required for multer and most AI endpoints
const upload = multer();

// Accept main reference image (required) + optional second reference
router.post(
  "/generate-image",
  upload.fields([
    { name: "referenceImage", maxCount: 1 },
    { name: "referenceImage2", maxCount: 1 },
  ]),
  generateImage
);

export default router;
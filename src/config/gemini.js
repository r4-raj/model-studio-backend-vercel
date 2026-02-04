import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

// Load env variables here so this file works even if imports are hoisted
dotenv.config();

const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
  throw new Error(
    "GEMINI_API_KEY is not set. Create backend/.env with GEMINI_API_KEY=your_key"
  );
}

export const genAI = new GoogleGenAI({
  apiKey: geminiApiKey,
});

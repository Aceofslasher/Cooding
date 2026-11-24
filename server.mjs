import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config({ path: ".env.local" });

const app = express();
const PORT = 3001;

app.use(express.json({ limit: "20kb" }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "Loopwise AI backend is running" });
});

// Gemini AI endpoint
app.post("/api/gemini", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "A message is required."
      });
    }

    if (message.length > 8000) {
      return res.status(400).json({
        error: "Message is too long."
      });
    }

    const response = await ai.interactions.create({
      model: "gemini-3.8-flash",
      input: message,
    });

    res.json({
      reply: response.output_text
    });
  } catch (error) {
    console.error("Gemini error:", error);
    res.status(500).json({
      error: "AI request failed. Please try again."
    });
  }
});

app.listen(PORT, () => {
  console.log(Loopwise AI backend running at http://localhost:${PORT});
});
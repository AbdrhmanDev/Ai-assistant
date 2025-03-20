require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const OpenAI = require("openai");
const multer = require("multer"); // Handle file uploads
const fs = require("fs"); // File system for handling uploads
const Tesseract = require("tesseract.js");

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Multer setup to handle image uploads
const upload = multer({ dest: "uploads/" });

const chatMemory = [
  { role: "system", content: "You are a helpful AI assistant." },
];

// app.post("/api/chat", async (req, res) => {
//   try {
//     const { message } = req.body;
//     if (!message) return res.status(400).json({ error: "Message is required" });

//     // Add user message to history
//     chatMemory.push({ role: "user", content: message });

//     // Send chat history to OpenRouter
//     const response = await axios.post(
//       "https://openrouter.ai/api/v1/chat/completions",
//       {
//         model: "mistralai/mistral-7b-instruct", // Adjust model if needed
//         messages: chatMemory,
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     const aiResponse = response.data.choices[0].message.content;

//     // Add AI response to memory
//     chatMemory.push({ role: "assistant", content: aiResponse });

//     // Keep only last 10 messages
//     if (chatMemory.length > 10) {
//       chatMemory.splice(0, chatMemory.length - 10);
//     }

//     res.json({ response: aiResponse });
//   } catch (error) {
//     console.error("Error:", error.response?.data || error.message);
//     res.status(500).json({ error: "Failed to process request" });
//   }
// });

// Handle image upload and extract text

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Keywords to detect image generation requests
    const imageKeywords = ["generate me an image", "give me an image", "make me an image", "create an image", "draw me"];

    // Check if the message is a request for an image
    if (imageKeywords.some((keyword) => message.toLowerCase().includes(keyword))) {
      const prompt = message.replace(/(generate|give|make|create|draw) (me )?(an|a)? ?image( of)?/i, "").trim();

      if (!prompt) {
        return res.status(400).json({ error: "Please provide a description for the image." });
      }

      const imageResponse = await axios.post(
        "https://openrouter.ai/api/v1/images/generations",
        {
          model: "openai/dall-e-3",
          prompt: prompt,
          n: 1,
          size: "1024x1024",
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      return res.json({ imageUrl: imageResponse.data.data[0].url });
    }

    // Add user message to history
    chatMemory.push({ role: "user", content: message });

    // Send chat history to OpenRouter
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: chatMemory,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const aiResponse = response.data.choices[0].message.content;

    // Add AI response to memory
    chatMemory.push({ role: "assistant", content: aiResponse });

    res.json({ response: aiResponse });
  } catch (error) {
    console.error("Error:", error.response?.data || error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

app.post("/api/upload-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const imagePath = req.file.path;

    // Extract text from image using Tesseract.js
    const { data } = await Tesseract.recognize(imagePath, "eng+ara");

    const extractedText = data.text;

    // Delete file after processing to save space
    fs.unlinkSync(imagePath);

    res.json({ text: extractedText });
  } catch (error) {
    console.error("Error processing image:", error.message);
    res.status(500).json({ error: "Failed to process image" });
  }
});
app.post("/api/upload-voice", upload.single("voice"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded." });
    }

    const audioPath = req.file.path;

    // Convert audio to text using OpenAI Whisper API
    const transcriptionResponse = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1", // Adjust model if needed
    });

    const transcribedText = transcriptionResponse.text;

    // Delete the uploaded file after processing
    fs.unlinkSync(audioPath);

    res.json({ text: transcribedText });
  } catch (error) {
    console.error("Error processing audio:", error);
    res.status(500).json({ error: "Failed to process audio file." });
  }
});
app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const response = await axios.post(
      "https://openrouter.ai/api/v1/images/generations",
      {
        model: "openai/dall-e-3", // Change to Stable Diffusion if needed
        prompt: prompt,
        n: 1,
        size: "1024x1024",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ imageUrl: response.data.data[0].url });
  } catch (error) {
    console.error("Error generating image:", error.response?.data || error);
    res.status(500).json({ error: "Failed to generate image" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

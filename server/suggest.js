import express from "express";
import { generateSuggestion } from "./suggestionEngine.js";

const router = express.Router();

router.post("/", express.json(), async (req, res) => {
  const { mode } = req.body || {};
  if (!mode || !["performance", "security", "test"].includes(mode)) {
    return res.status(400).json({ error: "Invalid mode" });
  }
  const subgraph = { nodes: [], paths: [] };
  try {
    const results = await generateSuggestion({ subgraph, mode });
    res.json({ suggestions: results });
  } catch (err) {
    console.error("generateSuggestion failed", err);
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
});

export default router;

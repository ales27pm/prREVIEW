import express from "express";
import { generateSuggestion } from "./suggestionEngine.js";

const router = express.Router();

router.post("/", express.json(), async (req, res) => {
  const { mode } = req.body;
  const subgraph = { nodes: [], paths: [] };
  const results = await generateSuggestion({ subgraph, mode });
  res.json({ suggestions: results });
});

export default router;

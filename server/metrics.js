import express from "express";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const router = express.Router();
const DB_FILE = path.join(process.cwd(), "metrics.json");
let db = { events: [] };

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (err) {
    console.error("Failed to parse metrics DB", err);
  }
}

function save() {
  fs.promises
    .writeFile(DB_FILE, JSON.stringify(db, null, 2))
    .catch((err) => console.error("Failed to save metrics DB", err));
}

router.post("/", express.json(), async (req, res) => {
  const e = { id: uuid(), timestamp: new Date().toISOString(), ...req.body };
  db.events.push(e);
  await save();
  res.status(201).json(e);
});

router.get("/report", (_req, res) => {
  const counts = db.events.reduce((acc, e) => {
    acc[e.event] = (acc[e.event] || 0) + 1;
    return acc;
  }, {});
  res.json({ counts, total: db.events.length });
});

export default router;

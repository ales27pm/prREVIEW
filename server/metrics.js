import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuid } from "uuid";

const router = express.Router();
const DB_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "metrics.json",
);
const db = { events: [] };

try {
  if (fs.existsSync(DB_FILE)) {
    db.events = JSON.parse(fs.readFileSync(DB_FILE, "utf8")).events || [];
  }
} catch (err) {
  console.error("Failed to load metrics DB", err);
}

async function save() {
  try {
    await fs.promises.writeFile(DB_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error("Failed to save metrics DB", err);
  }
}

const MAX_EVENTS = 1000;

router.post("/", express.json(), async (req, res) => {
  const { event, pr, user } = req.body || {};
  if (typeof event !== "string") {
    return res.status(400).json({ error: "Invalid payload" });
  }
  const e = { id: uuid(), timestamp: new Date().toISOString(), event };
  if (pr) e.pr = pr;
  if (user) e.user = user;
  db.events.push(e);
  if (db.events.length > MAX_EVENTS) {
    db.events.shift();
  }
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

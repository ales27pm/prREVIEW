import express from "express";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const router = express.Router();
const DB_FILE = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "metrics.json",
);
let db = { events: [] };

if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

router.post("/", express.json(), (req, res) => {
  const e = { id: uuid(), timestamp: new Date().toISOString(), ...req.body };
  db.events.push(e);
  save();
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

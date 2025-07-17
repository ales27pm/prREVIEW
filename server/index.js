import express from "express";
import fs from "fs/promises";

const app = express();
app.use(express.json());

const DATA_FILE = process.env.FEEDBACK_FILE || "feedbackData.json";

async function readData() {
  try {
    const txt = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(txt);
  } catch {
    return [];
  }
}

async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

app.post("/feedback", async (req, res) => {
  const record = req.body || {};
  const data = await readData();
  data.push({ ...record, ts: Date.now() });
  await writeData(data);
  res.json({ ok: true });
});

app.get("/analytics", async (_req, res) => {
  const data = await readData();
  const counts = { up: 0, down: 0 };
  for (const r of data) {
    if (r.rating === "up") counts.up++;
    else if (r.rating === "down") counts.down++;
  }
  res.json(counts);
});

app.get("/export", async (_req, res) => {
  const data = await readData();
  res.json(data);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Feedback backend listening on ${port}`));

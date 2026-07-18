import express from "express";
import helmet from "helmet";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app = express();
const port = process.env.PORT || 3100;
const dbPath = process.env.COMMENTS_DB || "/var/lib/ori-lin/comments.sqlite";
const adminToken = process.env.ADMIN_TOKEN || "";

const db = await open({
  filename: dbPath,
  driver: sqlite3.Database,
});

await db.exec(`
  create table if not exists comments (
    id integer primary key autoincrement,
    page text not null,
    parent_id integer,
    name text not null,
    body text not null,
    likes integer not null default 0,
    created_at text not null default (datetime('now'))
  );
  create index if not exists idx_comments_page on comments(page, created_at);

  create table if not exists applications (
    id integer primary key autoincrement,
    name text not null,
    contact text not null,
    asset_range text not null,
    note text not null,
    created_at text not null default (datetime('now'))
  );

  create table if not exists pageviews (
    day text not null,
    page text not null,
    source text not null default '',
    referrer text not null default 'direct',
    views integer not null default 0,
    primary key (day, page, source, referrer)
  );
`);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

app.post("/api/pageviews", async (req, res) => {
  const page = cleanText(req.body.page, 200);
  const source = cleanText(req.body.source, 80);
  const referrer = cleanText(req.body.referrer, 160) || "direct";
  if (!page) return res.status(400).json({ error: "missing_page" });

  await db.run(
    `insert into pageviews (day, page, source, referrer, views)
     values (date('now'), ?, ?, ?, 1)
     on conflict(day, page, source, referrer) do update set views = views + 1`,
    page,
    source,
    referrer
  );
  res.status(204).end();
});

app.get("/api/stats", async (req, res) => {
  const token = cleanText(req.query.token, 120);
  if (!adminToken || token !== adminToken) return res.status(401).json({ error: "unauthorized" });

  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const rows = await db.all(
    `select day, page, source, referrer, views
     from pageviews
     where day >= date('now', ?)
     order by day desc, views desc`,
    `-${days - 1} days`
  );
  res.json(rows);
});

app.get("/api/comments", async (req, res) => {
  const page = cleanText(req.query.page, 200);
  if (!page) return res.json([]);
  const rows = await db.all(
    "select id, page, parent_id, name, body, likes, created_at from comments where page = ? order by id asc",
    page
  );
  res.json(rows);
});

app.post("/api/comments", async (req, res) => {
  const page = cleanText(req.body.page, 200);
  const name = cleanText(req.body.name, 40);
  const body = cleanText(req.body.body, 1000);
  const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;

  if (!page || !name || !body) {
    return res.status(400).json({ error: "missing_fields" });
  }

  await db.run(
    "insert into comments (page, parent_id, name, body) values (?, ?, ?, ?)",
    page,
    Number.isFinite(parentId) ? parentId : null,
    name,
    body
  );

  res.status(201).json({ ok: true });
});

app.post("/api/comments/:id/like", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });
  await db.run("update comments set likes = likes + 1 where id = ?", id);
  res.json({ ok: true });
});

app.post("/api/applications", async (req, res) => {
  const name = cleanText(req.body.name, 80);
  const contact = cleanText(req.body.contact, 120);
  const assetRange = cleanText(req.body.asset_range, 80);
  const note = cleanText(req.body.note, 1200);

  if (!name || !contact || !assetRange || !note) {
    return res.status(400).json({ error: "missing_fields" });
  }

  await db.run(
    "insert into applications (name, contact, asset_range, note) values (?, ?, ?, ?)",
    name,
    contact,
    assetRange,
    note
  );

  res.status(201).json({ ok: true });
});

app.get("/api/applications", async (req, res) => {
  const token = cleanText(req.query.token, 120);
  if (!adminToken || token !== adminToken) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const rows = await db.all(
    "select id, name, contact, asset_range, note, created_at from applications order by id desc limit 200"
  );
  res.json(rows);
});

app.listen(port, "127.0.0.1", () => {
  console.log(`ORI-LIN API listening on 127.0.0.1:${port}`);
});

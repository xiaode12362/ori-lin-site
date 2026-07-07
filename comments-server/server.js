import express from "express";
import helmet from "helmet";
import Database from "better-sqlite3";

const app = express();
const port = process.env.PORT || 3100;
const dbPath = process.env.COMMENTS_DB || "/var/lib/ori-lin/comments.sqlite";
const db = new Database(dbPath);

db.exec(`
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
`);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

app.get("/api/comments", (req, res) => {
  const page = cleanText(req.query.page, 200);
  if (!page) return res.json([]);
  const rows = db
    .prepare("select id, page, parent_id, name, body, likes, created_at from comments where page = ? order by id asc")
    .all(page);
  res.json(rows);
});

app.post("/api/comments", (req, res) => {
  const page = cleanText(req.body.page, 200);
  const name = cleanText(req.body.name, 40);
  const body = cleanText(req.body.body, 1000);
  const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;

  if (!page || !name || !body) {
    return res.status(400).json({ error: "missing_fields" });
  }

  db.prepare("insert into comments (page, parent_id, name, body) values (?, ?, ?, ?)")
    .run(page, Number.isFinite(parentId) ? parentId : null, name, body);
  res.status(201).json({ ok: true });
});

app.post("/api/comments/:id/like", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });
  db.prepare("update comments set likes = likes + 1 where id = ?").run(id);
  res.json({ ok: true });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`ORI-LIN comments listening on 127.0.0.1:${port}`);
});

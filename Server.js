import express from "express";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";
import Database from "better-sqlite3";
import "dotenv/config";



const app = express();
const PORT = process.env.PORT || 3000;

// ===== DATABASE =====
const db = new Database("data.db");

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    username TEXT,
    avatar TEXT,
    last_login TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS entries (
    discord_id TEXT PRIMARY KEY,
    entered_at TEXT
  )
`).run();

// ===== MIDDLEWARE =====
app.use(cookieParser());

// ===== HOME =====
app.get("/", (req, res) => {
  res.send(`
    <h1>🏆 SolWinner Giveaway</h1>
    <p>Free Solana giveaways</p>
    <a href="/login">Login with Discord</a>
  `);
});

// ===== DISCORD LOGIN =====
app.get("/login", (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify"
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// ===== OAUTH CALLBACK =====
app.get("/callback", async (req, res) => {
  const code = req.query.code;

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI
    })
  });

  const token = await tokenRes.json();

  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });

  const user = await userRes.json();

  db.prepare(`
    INSERT INTO users (discord_id, username, avatar, last_login)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      username=excluded.username,
      avatar=excluded.avatar,
      last_login=excluded.last_login
  `).run(
    user.id,
    `${user.username}#${user.discriminator}`,
    user.avatar,
    new Date().toISOString()
  );

  res.cookie("discord", JSON.stringify(user), { httpOnly: true });
  res.redirect("/dashboard");
});

// ===== DASHBOARD =====
app.get("/dashboard", (req, res) => {
  if (!req.cookies.discord) return res.redirect("/");

  const user = JSON.parse(req.cookies.discord);

  res.send(`
    <h1>Welcome ${user.username}</h1>
    <a href="/enter">Enter Giveaway</a>
  `);
});

// ===== ENTER GIVEAWAY =====
app.get("/enter", (req, res) => {
  if (!req.cookies.discord) return res.redirect("/");

  const user = JSON.parse(req.cookies.discord);

  db.prepare(`
    INSERT OR IGNORE INTO entries (discord_id, entered_at)
    VALUES (?, ?)
  `).run(user.id, new Date().toISOString());

  res.send("<h1>✅ You are entered!</h1>");
});

// ===== ADMIN LOGIN (SECRET COOKIE) =====
app.get("/admin-login", (req, res) => {
  if (req.query.secret !== process.env.ADMIN_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  res.cookie("admin", "true", {
    httpOnly: true,
    sameSite: "strict",
    secure: false
  });

  res.redirect("/admin");
});

// ===== ADMIN PAGE =====
app.get("/admin", (req, res) => {
  if (req.cookies.admin !== "true") return res.redirect("/");

  const users = db.prepare("SELECT * FROM users").all();

  let rows = users.map(
    u => `<tr><td>${u.discord_id}</td><td>${u.username}</td><td>${u.last_login}</td></tr>`
  ).join("");

  res.send(`
    <h1>SolWinner Admin</h1>
    <table border="1">
      <tr><th>ID</th><th>User</th><th>Last Login</th></tr>
      ${rows}
    </table>
  `);
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log("SolWinner running on port", PORT);
});

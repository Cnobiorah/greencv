/**
 * GreenCV — Production Server
 * Node.js (no dependencies required)
 * 
 * Setup:
 *   1. Set your API key below or use environment variable:
 *      ANTHROPIC_API_KEY=sk-ant-xxx node server.js
 *   2. node server.js
 *   3. Open http://localhost:3000
 */

"use strict";

const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");
const url   = require("url");

// ── CONFIG ────────────────────────────────────────────────────────────
const CONFIG = {
  PORT:            process.env.PORT || 3000,
  API_KEY:         process.env.ANTHROPIC_API_KEY || "YOUR_API_KEY_HERE",
  MAX_CV_LENGTH:   8000,       // characters
  MAX_BODY_SIZE:   50 * 1024,  // 50KB request limit
  RATE_LIMIT:      10,         // requests per window per IP
  RATE_WINDOW_MS:  60 * 1000,  // 1 minute window
  ALLOWED_ORIGINS: ["http://localhost:3000", "http://127.0.0.1:3000"],
};

const VALID_ROLES = new Set([
  "Sustainability Analyst", "Green Building Consultant", "Architect",
  "Urban Planner", "Climate / ESG Analyst", "Renewable Energy Engineer",
  "Environmental Consultant", "Carbon Manager", "Energy Auditor",
  "Circular Economy Specialist",
]);

// ── RATE LIMITER ──────────────────────────────────────────────────────
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };

  if (now - entry.start > CONFIG.RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }

  if (entry.count >= CONFIG.RATE_LIMIT) return true;

  entry.count++;
  rateLimitMap.set(ip, entry);
  return false;
}

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.start > CONFIG.RATE_WINDOW_MS * 2) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

// ── HELPERS ───────────────────────────────────────────────────────────
function getClientIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type":  "application/json",
    "Content-Length": Buffer.byteLength(body),
    ...securityHeaders(),
  });
  res.end(body);
}

function sendHTML(res, status, filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    res.writeHead(status, {
      "Content-Type":  "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(content),
      ...securityHeaders(),
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

function securityHeaders() {
  return {
    "X-Content-Type-Options":  "nosniff",
    "X-Frame-Options":         "DENY",
    "X-XSS-Protection":        "1; mode=block",
    "Referrer-Policy":         "strict-origin-when-cross-origin",
    "Cache-Control":           "no-store",
  };
}

function readBody(req, maxSize) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        return reject(new Error("Request too large"));
      }
      body += chunk.toString();
    });
    req.on("end",   () => resolve(body));
    req.on("error", reject);
  });
}

// ── AI PROMPT ─────────────────────────────────────────────────────────
function buildPrompt(cvText, role) {
  const safe = cvText.slice(0, CONFIG.MAX_CV_LENGTH).replace(/[<>]/g, "");
  return `You are a senior CV consultant specializing in green energy, sustainability, and environmental careers.

Analyze this CV for the target role: "${role}"

CV:
---
${safe}
---

Respond ONLY with a valid JSON object. No markdown, no backticks, no text outside the JSON.

{
  "score": <integer 0-100>,
  "scoreComment": "<one professional sentence on overall quality>",
  "ats": <integer 0-100>,
  "greenSkills": <integer 0-100>,
  "expImpact": <integer 0-100>,
  "strengths": ["<s1>","<s2>","<s3>","<s4>"],
  "issues": [
    {"sev":"high","text":"<specific issue>"},
    {"sev":"med","text":"<specific issue>"},
    {"sev":"high","text":"<specific issue>"},
    {"sev":"low","text":"<specific issue>"}
  ],
  "missingSkills": ["<sk1>","<sk2>","<sk3>","<sk4>","<sk5>"],
  "steps": ["<step1>","<step2>","<step3>","<step4>"],
  "rewrittenCV": "<Complete ATS-optimised professional CV for ${role}. Use \\n for line breaks. Sections: CONTACT INFORMATION, PROFESSIONAL SUMMARY, KEY COMPETENCIES, PROFESSIONAL EXPERIENCE (quantified achievements), EDUCATION, CERTIFICATIONS & TRAINING, TECHNICAL SKILLS. Embed sustainability/green energy keywords naturally. Make it complete and excellent.>",
  "skillGap": [
    {"skill":"Carbon Accounting","current":<0-100>},
    {"skill":"ESG Reporting","current":<0-100>},
    {"skill":"Life Cycle Assessment","current":<0-100>},
    {"skill":"Renewable Energy Systems","current":<0-100>},
    {"skill":"LEED / BREEAM","current":<0-100>},
    {"skill":"Climate Policy","current":<0-100>},
    {"skill":"Green Finance","current":<0-100>},
    {"skill":"Environmental Compliance","current":<0-100>}
  ],
  "tools": ["<tool1>","<tool2>","<tool3>","<tool4>","<tool5>"],
  "certs": [
    {"name":"<certification>","why":"<one sentence relevance to ${role}>"},
    {"name":"<certification>","why":"<one sentence>"},
    {"name":"<certification>","why":"<one sentence>"}
  ],
  "actionPlan": [
    {"phase":"30 Days","action":"<specific task>"},
    {"phase":"30 Days","action":"<specific task>"},
    {"phase":"60 Days","action":"<specific task>"},
    {"phase":"60 Days","action":"<specific task>"},
    {"phase":"90 Days","action":"<specific task>"},
    {"phase":"90 Days","action":"<specific task>"}
  ]
}`;
}

// ── ANTHROPIC API CALL ────────────────────────────────────────────────
function callAnthropic(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages:   [{ role: "user", content: prompt }],
    });

    const options = {
      hostname: "api.anthropic.com",
      path:     "/v1/messages",
      method:   "POST",
      headers: {
        "Content-Type":      "application/json",
        "Content-Length":    Buffer.byteLength(payload),
        "x-api-key":         CONFIG.API_KEY,
        "anthropic-version": "2023-06-01",
      },
    };

    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message || "Anthropic API error"));
          const text = (parsed.content || []).map(b => b.text || "").join("");
          const clean = text.replace(/```json|```/g, "").trim();
          let result;
          try {
            result = JSON.parse(clean);
          } catch {
            const match = clean.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("No JSON found in response");
            result = JSON.parse(match[0]);
          }
          resolve(result);
        } catch (e) {
          reject(new Error("Failed to parse AI response: " + e.message));
        }
      });
    });

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error("Request timed out after 60 seconds"));
    });

    req.on("error", e => reject(new Error("Network error: " + e.message)));
    req.write(payload);
    req.end();
  });
}

// ── REQUEST HANDLER ───────────────────────────────────────────────────
async function handler(req, res) {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method   = req.method.toUpperCase();
  const ip       = getClientIP(req);

  // ── Static files ──
  if (method === "GET" && pathname === "/") {
    return sendHTML(res, 200, path.join(__dirname, "index.html"));
  }
  if (method === "GET" && pathname === "/landing") {
    return sendHTML(res, 200, path.join(__dirname, "landing.html"));
  }

  // ── Health check ──
  if (method === "GET" && pathname === "/health") {
    return sendJSON(res, 200, { status: "ok", timestamp: new Date().toISOString() });
  }

  // ── Analyze endpoint ──
  if (method === "POST" && pathname === "/analyze") {

    // Rate limit
    if (isRateLimited(ip)) {
      return sendJSON(res, 429, { error: "Too many requests. Please wait a minute and try again." });
    }

    // Parse body
    let body;
    try {
      const raw = await readBody(req, CONFIG.MAX_BODY_SIZE);
      body = JSON.parse(raw);
    } catch (e) {
      return sendJSON(res, 400, { error: "Invalid request body: " + e.message });
    }

    const { cvText, role } = body;

    // Validate inputs
    if (!cvText || typeof cvText !== "string" || cvText.trim().length < 50) {
      return sendJSON(res, 400, { error: "CV text is too short. Please provide at least 50 characters." });
    }
    if (!role || !VALID_ROLES.has(role)) {
      return sendJSON(res, 400, { error: "Invalid role selected." });
    }
    if (!CONFIG.API_KEY || CONFIG.API_KEY === "YOUR_API_KEY_HERE") {
      return sendJSON(res, 500, { error: "Server is not configured. API key missing." });
    }

    // Call AI
    try {
      const result = await callAnthropic(buildPrompt(cvText.trim(), role));
      result.role = role;
      result.analyzedAt = new Date().toISOString();
      return sendJSON(res, 200, result);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] AI Error for IP ${ip}:`, e.message);
      return sendJSON(res, 502, { error: "AI analysis failed: " + e.message });
    }
  }

  // ── 404 ──
  return sendJSON(res, 404, { error: "Not found" });
}

// ── START SERVER ──────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  handler(req, res).catch(e => {
    console.error("Unhandled error:", e);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });
});

server.listen(CONFIG.PORT, () => {
  console.log("━".repeat(50));
  console.log("  🌱 GreenCV Server — Production Ready");
  console.log("━".repeat(50));
  console.log(`  App:     http://localhost:${CONFIG.PORT}`);
  console.log(`  Landing: http://localhost:${CONFIG.PORT}/landing`);
  console.log(`  Health:  http://localhost:${CONFIG.PORT}/health`);
  console.log("━".repeat(50));

  if (!CONFIG.API_KEY || CONFIG.API_KEY === "YOUR_API_KEY_HERE") {
    console.warn("\n  ⚠️  WARNING: ANTHROPIC_API_KEY not set!");
    console.warn("  Set it with: ANTHROPIC_API_KEY=sk-ant-xxx node server.js\n");
  } else {
    console.log("  ✅ API key configured");
  }

  console.log(`  Rate limit: ${CONFIG.RATE_LIMIT} requests/min per IP`);
  console.log("━".repeat(50) + "\n");
});

server.on("error", e => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n  ❌ Port ${CONFIG.PORT} is already in use.`);
    console.error(`  Try: PORT=3001 node server.js\n`);
  } else {
    console.error("Server error:", e);
  }
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => { server.close(() => { console.log("Server shut down."); process.exit(0); }); });
process.on("SIGINT",  () => { server.close(() => { console.log("\nServer shut down."); process.exit(0); }); });

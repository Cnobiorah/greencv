const https = require("https");

function supabaseRequest(method, path, body, url, key) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: parsed.hostname,
      path: `/rest/v1/${path}`,
      method,
      headers: {
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Prefer": method === "POST" ? "return=minimal" : "return=representation",
      },
    };

    if (payload) options.headers["Content-Length"] = Buffer.byteLength(payload);

    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, data: null }); }
      });
    });

    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timed out")); });
    req.on("error", e => reject(new Error(e.message)));
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return res.status(500).json({ error: "Database not configured" });

  try {
    const result = await supabaseRequest(
      "GET",
      `feedback?rating=gte.4&order=created_at.desc&limit=6`,
      null, url, key
    );

    const feedback = Array.isArray(result.data) ? result.data : [];
    return res.status(200).json({ feedback, total: feedback.length });
  } catch(e) {
    return res.status(200).json({ feedback: [], total: 0 });
  }
};

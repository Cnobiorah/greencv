const https = require("https");

function supabaseGet(supabaseUrl, supabaseKey, path) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(supabaseUrl);
    const options = {
      hostname: parsed.hostname,
      path: `/rest/v1/${path}`,
      method: "GET",
      headers: {
        "apikey":        supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type":  "application/json",
      },
    };
    const req = https.request(options, r => {
      let data = "";
      r.on("data", chunk => data += chunk);
      r.on("end", () => {
        try { resolve({ status: r.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: r.statusCode, data: [] }); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timed out")); });
    req.on("error", reject);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Admin key protection
  const adminKey = req.headers["x-admin-key"];
  const validKey = process.env.ADMIN_SECRET_KEY;
  if (!validKey || adminKey !== validKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ error: "Database not configured" });

  try {
    // Fetch all data in parallel
    const [feedbackRes, analysesRes] = await Promise.all([
      supabaseGet(url, key, "feedback?order=created_at.desc&limit=100&select=*"),
      supabaseGet(url, key, "analyses?order=created_at.desc&limit=100&select=*"),
    ]);

    const feedback = Array.isArray(feedbackRes.data) ? feedbackRes.data : [];
    const analyses = Array.isArray(analysesRes.data) ? analysesRes.data : [];

    // Calculate stats
    const avgRating = feedback.length
      ? (feedback.reduce((s, f) => s + (f.rating || 0), 0) / feedback.length).toFixed(1)
      : 0;

    const avgScore = analyses.length
      ? Math.round(analyses.reduce((s, a) => s + (a.score || 0), 0) / analyses.length)
      : 0;

    const roleCount = analyses.reduce((acc, a) => {
      if (a.role) acc[a.role] = (acc[a.role] || 0) + 1;
      return acc;
    }, {});

    const topRole = Object.entries(roleCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

    const wouldPay = feedback.filter(f => f.pay && f.pay.startsWith("Yes")).length;

    return res.status(200).json({
      stats: {
        totalAnalyses:  analyses.length,
        totalFeedback:  feedback.length,
        avgRating:      Number(avgRating),
        avgScore,
        topRole,
        wouldPay,
        wouldPayPct:    feedback.length ? Math.round((wouldPay / feedback.length) * 100) : 0,
      },
      analyses,
      feedback,
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};

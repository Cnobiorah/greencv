const https = require("https");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json({ feedback: [], total: 0 });
  }

  return new Promise((resolve) => {
    try {
      const parsed = new URL(supabaseUrl);
      const path   = "/rest/v1/feedback?order=created_at.desc&limit=50&select=rating,feature,improve,email,created_at";

      const options = {
        hostname: parsed.hostname,
        path,
        method: "GET",
        headers: {
          "apikey":        supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type":  "application/json",
        },
      };

      const req2 = https.request(options, r => {
        let data = "";
        r.on("data", chunk => data += chunk);
        r.on("end", () => {
          try {
            const feedback = JSON.parse(data);
            if (Array.isArray(feedback)) {
              resolve(res.status(200).json({ feedback, total: feedback.length }));
            } else {
              resolve(res.status(200).json({ feedback: [], total: 0 }));
            }
          } catch(e) {
            resolve(res.status(200).json({ feedback: [], total: 0 }));
          }
        });
      });

      req2.setTimeout(8000, () => {
        req2.destroy();
        resolve(res.status(200).json({ feedback: [], total: 0 }));
      });

      req2.on("error", () => {
        resolve(res.status(200).json({ feedback: [], total: 0 }));
      });

      req2.end();

    } catch(e) {
      resolve(res.status(200).json({ feedback: [], total: 0 }));
    }
  });
};

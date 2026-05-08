const https = require("https");

function supabaseInsert(supabaseUrl, supabaseKey, data) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(supabaseUrl);
    const payload = JSON.stringify(data);
    const options = {
      hostname: parsed.hostname,
      path:     "/rest/v1/feedback",
      method:   "POST",
      headers: {
        "Content-Type":  "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "apikey":         supabaseKey,
        "Authorization":  `Bearer ${supabaseKey}`,
        "Prefer":         "return=minimal",
      },
    };
    const req = https.request(options, r => {
      let d = "";
      r.on("data", chunk => d += chunk);
      r.on("end", () => resolve({ status: r.statusCode, body: d }));
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error("Supabase timed out")); });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function sendEmail(to, subject, html, sgKey, fromEmail) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: "GreenCV Feedback" },
      subject,
      content: [{ type: "text/html", value: html }],
    });
    const options = {
      hostname: "api.sendgrid.com",
      path:     "/v3/mail/send",
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization":  `Bearer ${sgKey}`,
      },
    };
    const req = https.request(options, r => {
      let d = "";
      r.on("data", chunk => d += chunk);
      r.on("end", () => resolve({ status: r.statusCode }));
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("SendGrid timed out")); });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { rating, feature, improve, pay, email } = req.body || {};
  if (!rating) return res.status(400).json({ error: "Rating required" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const sgKey       = process.env.SENDGRID_API_KEY;
  const fromEmail   = process.env.SENDGRID_FROM_EMAIL || "noreply.greencv@gmail.com";
  const ownerEmail  = process.env.OWNER_EMAIL || fromEmail;

  // 1. Save to Supabase
  if (supabaseUrl && supabaseKey) {
    try {
      const result = await supabaseInsert(supabaseUrl, supabaseKey, {
        rating:  Number(rating),
        feature: feature || null,
        improve: improve || null,
        pay:     pay || null,
        email:   email ? email.split("@")[0] + "@***" : null,
      });
      console.log("Supabase insert status:", result.status, result.body);
    } catch(e) {
      console.error("Supabase error:", e.message);
    }
  }

  // 2. Send email notification
  const stars = "★".repeat(Number(rating)) + "☆".repeat(5 - Number(rating));
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f3;padding:2rem;">
  <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;">
    <div style="background:#111110;padding:1.5rem;text-align:center;">
      <span style="color:#b5e853;font-size:1.1rem;font-weight:700;">🌱 GreenCV — New Feedback</span>
    </div>
    <div style="padding:1.5rem;">
      <p><strong>Rating:</strong> ${stars} (${rating}/5)</p>
      <p><strong>Best Feature:</strong> ${feature || "Not specified"}</p>
      <p><strong>Would Pay:</strong> ${pay || "Not specified"}</p>
      <p><strong>Email:</strong> ${email || "Anonymous"}</p>
      <p><strong>Improvement:</strong> ${improve || "None"}</p>
    </div>
  </div>
</body></html>`;

  if (sgKey) {
    try {
      await sendEmail(ownerEmail, `⭐ GreenCV Feedback ${stars}`, html, sgKey, fromEmail);
    } catch(e) {
      console.error("Email error:", e.message);
    }
  }

  return res.status(200).json({ success: true });
};

const https = require("https");

function sendSendGrid(to, subject, html, apiKey, fromEmail) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail || "noreply.greencv@gmail.com", name: "GreenCV Feedback" },
      subject,
      content: [{ type: "text/html", value: html }],
    });

    const options = {
      hostname: "api.sendgrid.com",
      path: "/v3/mail/send",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization": `Bearer ${apiKey}`,
      },
    };

    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ success: true });
        else reject(new Error(`SendGrid error ${res.statusCode}: ${data}`));
      });
    });

    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timed out")); });
    req.on("error", e => reject(new Error(e.message)));
    req.write(payload); req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { rating, feature, improve, pay, email } = req.body || {};

  const sendgridKey  = process.env.SENDGRID_API_KEY;
  const fromEmail    = process.env.SENDGRID_FROM_EMAIL || "noreply.greencv@gmail.com";
  const ownerEmail   = process.env.OWNER_EMAIL || fromEmail;

  const stars = "★".repeat(rating || 0) + "☆".repeat(5 - (rating || 0));

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f3;padding:2rem;color:#2c2c28;">
  <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;">
    <div style="background:#111110;padding:1.5rem;text-align:center;">
      <span style="color:#b5e853;font-size:1.1rem;font-weight:700;">🌱 GreenCV — New Feedback</span>
    </div>
    <div style="padding:1.5rem;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:.6rem 0;font-size:.85rem;color:#999;width:140px;border-bottom:1px solid #f0f0ee;">Rating</td>
          <td style="padding:.6rem 0;font-size:1rem;color:#f59e0b;border-bottom:1px solid #f0f0ee;">${stars} (${rating}/5)</td>
        </tr>
        <tr>
          <td style="padding:.6rem 0;font-size:.85rem;color:#999;border-bottom:1px solid #f0f0ee;">Best Feature</td>
          <td style="padding:.6rem 0;font-size:.85rem;border-bottom:1px solid #f0f0ee;">${feature || "Not specified"}</td>
        </tr>
        <tr>
          <td style="padding:.6rem 0;font-size:.85rem;color:#999;border-bottom:1px solid #f0f0ee;">Would Pay?</td>
          <td style="padding:.6rem 0;font-size:.85rem;border-bottom:1px solid #f0f0ee;">${pay || "Not specified"}</td>
        </tr>
        <tr>
          <td style="padding:.6rem 0;font-size:.85rem;color:#999;border-bottom:1px solid #f0f0ee;">User Email</td>
          <td style="padding:.6rem 0;font-size:.85rem;border-bottom:1px solid #f0f0ee;">${email || "Anonymous"}</td>
        </tr>
        <tr>
          <td style="padding:.6rem 0;font-size:.85rem;color:#999;vertical-align:top;">Improvement</td>
          <td style="padding:.6rem 0;font-size:.85rem;">${improve || "None provided"}</td>
        </tr>
      </table>
    </div>
    <div style="background:#f8f8f6;padding:1rem;text-align:center;font-size:.75rem;color:#999;">
      Submitted at ${new Date().toLocaleString("en-GB", {timeZone:"Africa/Lagos"})} WAT
    </div>
  </div>
</body>
</html>`;

  // Save to global store for landing page feed
  const feedbackStore = global.feedbackStore || [];
  global.feedbackStore = feedbackStore;
  if ((rating || 0) >= 4) {
    feedbackStore.push({
      rating: rating || 0,
      feature: feature || "",
      improve: improve || "",
      pay: pay || "",
      email: email ? email.split("@")[0] + "@***" : "",
      date: new Date().toISOString(),
    });
    if (feedbackStore.length > 50) feedbackStore.shift();
  }

  try {
    if (sendgridKey) {
      await sendSendGrid(ownerEmail, `⭐ GreenCV Feedback — ${stars} from ${email || "Anonymous"}`, html, sendgridKey, fromEmail);
    }
    return res.status(200).json({ success: true });
  } catch(e) {
    console.error("Feedback email error:", e.message);
    return res.status(200).json({ success: true });
  }
};

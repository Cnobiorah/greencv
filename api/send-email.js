const https = require("https");

function sendSendGrid(to, subject, html, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.SENDGRID_FROM_EMAIL || "noreply@greencv.app", name: "GreenCV" },
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

    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Email timed out")); });
    req.on("error", e => reject(new Error(e.message)));
    req.write(payload); req.end();
  });
}

function buildEmailHTML(result) {
  const scoreColor = result.score >= 70 ? "#166534" : result.score >= 45 ? "#b45309" : "#dc2626";
  const strengths = (result.strengths || []).map(s => `<li>${s}</li>`).join("");
  const issues = (result.issues || []).map(i => `<li>${i.text}</li>`).join("");
  const steps = (result.steps || []).map(s => `<li>${s}</li>`).join("");
  const missing = (result.missingSkills || []).map(s => `<span style="background:#fef2f2;color:#b91c1c;padding:3px 8px;border-radius:3px;font-size:12px;margin:2px;display:inline-block;">${s}</span>`).join(" ");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f5f5f3;padding:0;margin:0;color:#2c2c28;">
  <div style="max-width:600px;margin:0 auto;padding:2rem 1rem;">

    <!-- HEADER -->
    <div style="background:#111110;border-radius:10px 10px 0 0;padding:2rem;text-align:center;">
      <div style="display:inline-flex;align-items:center;gap:8px;">
        <div style="width:28px;height:28px;background:#1a6b3c;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;">G</div>
        <span style="color:#fff;font-size:1.2rem;font-weight:700;">GreenCV</span>
      </div>
      <p style="color:rgba(255,255,255,.5);font-size:.85rem;margin-top:.5rem;">Your CV Analysis Results</p>
    </div>

    <!-- SCORE CARD -->
    <div style="background:#fff;padding:2rem;border-left:1px solid #e8e8e4;border-right:1px solid #e8e8e4;">
      <div style="text-align:center;padding:1.5rem;background:#f8f8f6;border-radius:8px;margin-bottom:1.5rem;">
        <div style="font-size:3rem;font-weight:700;color:${scoreColor};line-height:1;">${result.score}</div>
        <div style="font-size:.8rem;color:#9a9990;margin-top:.25rem;">Overall CV Score</div>
        <div style="font-size:.85rem;color:${scoreColor};font-weight:600;margin-top:.5rem;">${result.score >= 70 ? "Strong" : result.score >= 45 ? "Needs Work" : "Weak"}</div>
        <p style="font-size:.82rem;color:#666;margin-top:.5rem;">${result.scoreComment}</p>
      </div>

      <!-- BREAKDOWN -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:1.5rem;">
        <tr>
          <td style="padding:.5rem 0;font-size:.82rem;">ATS Compatibility</td>
          <td style="text-align:right;font-weight:600;color:#1a6b3c;">${result.ats}%</td>
        </tr>
        <tr>
          <td style="padding:.5rem 0;font-size:.82rem;border-top:1px solid #f0f0ee;">Green Skills Match</td>
          <td style="text-align:right;font-weight:600;color:#1a6b3c;border-top:1px solid #f0f0ee;">${result.greenSkills}%</td>
        </tr>
        <tr>
          <td style="padding:.5rem 0;font-size:.82rem;border-top:1px solid #f0f0ee;">Experience Impact</td>
          <td style="text-align:right;font-weight:600;color:#1a6b3c;border-top:1px solid #f0f0ee;">${result.expImpact}%</td>
        </tr>
      </table>

      <!-- STRENGTHS -->
      <h3 style="font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9a9990;margin-bottom:.75rem;">Top Strengths</h3>
      <ul style="margin:0 0 1.5rem 0;padding-left:1.25rem;font-size:.84rem;line-height:1.8;">${strengths}</ul>

      <!-- ISSUES -->
      <h3 style="font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9a9990;margin-bottom:.75rem;">Key Issues</h3>
      <ul style="margin:0 0 1.5rem 0;padding-left:1.25rem;font-size:.84rem;line-height:1.8;">${issues}</ul>

      <!-- MISSING SKILLS -->
      <h3 style="font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9a9990;margin-bottom:.75rem;">Missing Skills</h3>
      <div style="margin-bottom:1.5rem;">${missing}</div>

      <!-- NEXT STEPS -->
      <h3 style="font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#9a9990;margin-bottom:.75rem;">Recommended Next Steps</h3>
      <ul style="margin:0 0 1.5rem 0;padding-left:1.25rem;font-size:.84rem;line-height:1.8;">${steps}</ul>

      <!-- CTA -->
      <div style="text-align:center;padding:1.5rem;background:#f8f8f6;border-radius:8px;margin-top:1rem;">
        <p style="font-size:.84rem;color:#666;margin-bottom:1rem;">View your full rewritten CV and skill gap analysis</p>
        <a href="https://greencv.vercel.app/app.html" style="background:#1a6b3c;color:#fff;padding:.75rem 1.5rem;border-radius:6px;text-decoration:none;font-weight:600;font-size:.875rem;">Open GreenCV →</a>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="background:#111110;border-radius:0 0 10px 10px;padding:1.25rem;text-align:center;">
      <p style="color:rgba(255,255,255,.3);font-size:.72rem;margin:0;">
        Generated by GreenCV · AI CV Analysis for Green &amp; Energy Professionals<br>
        You received this because you requested your results to be emailed.
      </p>
    </div>

  </div>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (!sendgridKey) return res.status(500).json({ error: "Email service not configured. Please add SENDGRID_API_KEY to your environment variables." });

  const { email, result } = req.body || {};
  if (!email || !email.includes("@")) return res.status(400).json({ error: "Invalid email address" });
  if (!result) return res.status(400).json({ error: "No results to send" });

  try {
    const html = buildEmailHTML(result);
    await sendSendGrid(email, `Your GreenCV Analysis — ${result.role} (Score: ${result.score}/100)`, html, sendgridKey);
    return res.status(200).json({ success: true });
  } catch(e) {
    return res.status(502).json({ error: "Failed to send email: " + e.message });
  }
};

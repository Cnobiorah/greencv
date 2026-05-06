const https = require("https");

const VALID_ROLES = new Set([
  "Sustainability Analyst", "Green Building Consultant", "Architect",
  "Urban Planner", "Climate / ESG Analyst", "Renewable Energy Engineer",
  "Environmental Consultant", "Carbon Manager", "Energy Auditor",
  "Circular Economy Specialist",
]);

function callAnthropic(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    };

    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = (parsed.content || []).map(b => b.text || "").join("");
          const clean = text.replace(/```json|```/g, "").trim();
          let result;
          try { result = JSON.parse(clean); }
          catch { const m = clean.match(/\{[\s\S]*\}/); result = JSON.parse(m[0]); }
          resolve(result);
        } catch (e) {
          reject(new Error("Failed to parse AI response: " + e.message));
        }
      });
    });

    req.setTimeout(60000, () => { req.destroy(); reject(new Error("Request timed out")); });
    req.on("error", e => reject(new Error("Network error: " + e.message)));
    req.write(payload);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const { cvText, role } = req.body || {};

  if (!cvText || cvText.trim().length < 50)
    return res.status(400).json({ error: "CV text is too short." });
  if (!role || !VALID_ROLES.has(role))
    return res.status(400).json({ error: "Invalid role selected." });

  const prompt = `You are a senior CV consultant specializing in green energy, sustainability, and environmental careers.

Analyze this CV for the target role: "${role}"

CV:
---
${cvText.slice(0, 6000)}
---

Respond ONLY with a valid JSON object (no markdown, no backticks):

{
  "score": <integer 0-100>,
  "scoreComment": "<one professional sentence>",
  "ats": <integer 0-100>,
  "greenSkills": <integer 0-100>,
  "expImpact": <integer 0-100>,
  "strengths": ["<s1>","<s2>","<s3>","<s4>"],
  "issues": [
    {"sev":"high","text":"<issue>"},
    {"sev":"med","text":"<issue>"},
    {"sev":"high","text":"<issue>"},
    {"sev":"low","text":"<issue>"}
  ],
  "missingSkills": ["<sk1>","<sk2>","<sk3>","<sk4>","<sk5>"],
  "steps": ["<step1>","<step2>","<step3>","<step4>"],
  "rewrittenCV": "<complete ATS-optimised CV. Sections: CONTACT INFORMATION, PROFESSIONAL SUMMARY, KEY COMPETENCIES, PROFESSIONAL EXPERIENCE, EDUCATION, CERTIFICATIONS, TECHNICAL SKILLS. Use \\n for line breaks.>",
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
  "tools": ["<t1>","<t2>","<t3>","<t4>","<t5>"],
  "certs": [
    {"name":"<cert>","why":"<one sentence>"},
    {"name":"<cert>","why":"<one sentence>"},
    {"name":"<cert>","why":"<one sentence>"}
  ],
  "actionPlan": [
    {"phase":"30 Days","action":"<action>"},
    {"phase":"30 Days","action":"<action>"},
    {"phase":"60 Days","action":"<action>"},
    {"phase":"60 Days","action":"<action>"},
    {"phase":"90 Days","action":"<action>"},
    {"phase":"90 Days","action":"<action>"}
  ]
}`;

  try {
    const result = await callAnthropic(prompt, apiKey);
    result.role = role;
    return res.status(200).json(result);
  } catch (e) {
    return res.status(502).json({ error: "AI analysis failed: " + e.message });
  }
};

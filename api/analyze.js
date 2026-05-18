const https = require("https");

const VALID_ROLES = new Set([
  "Sustainability Analyst", "Green Building Consultant", "Architect",
  "Urban Planner", "Climate / ESG Analyst", "Renewable Energy Engineer",
  "Environmental Consultant", "Carbon Manager", "Energy Auditor",
  "Circular Economy Specialist",
]);

function isValidRole(role) {
  // Accept predefined roles OR any custom role (2-80 chars, no HTML)
  if (VALID_ROLES.has(role)) return true;
  if (typeof role === "string" && role.length >= 2 && role.length <= 80 && !/[<>]/.test(role)) return true;
  return false;
}

function callAnthropic(messages, apiKey, maxTokens = 4000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: maxTokens,
      messages,
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
          resolve(parsed);
        } catch (e) {
          reject(new Error("Failed to parse Anthropic response"));
        }
      });
    });

    req.setTimeout(60000, () => { req.destroy(); reject(new Error("Request timed out")); });
    req.on("error", e => reject(new Error("Network error: " + e.message)));
    req.write(payload);
    req.end();
  });
}

function buildPrompt(cvText, role) {
  return `You are a senior CV consultant specializing in green energy, sustainability, and environmental careers.

Analyze this CV for the target role: "${role}"

CV:
---
${cvText.slice(0, 6000)}
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
  "tools": ["<specific tool this user needs based on CV and role>","<tool2>","<tool3>","<tool4>","<tool5>"],
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

module.exports = async function handler(req, res) {
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
  if (!role || !isValidRole(role))
    return res.status(400).json({ error: "Invalid role. Please select or type a valid role." });

  try {
    const response = await callAnthropic([
      { role: "user", content: buildPrompt(cvText.trim(), role) }
    ], apiKey);

    const text = (response.content || []).map(b => b.text || "").join("");
    const clean = text.replace(/```json|```/g, "").trim();
    let result;
    try { result = JSON.parse(clean); }
    catch { const m = clean.match(/\{[\s\S]*\}/); result = JSON.parse(m[0]); }

    result.role = role;

    // Save analysis to Supabase — must be awaited before responding,
    // otherwise Vercel terminates the function before the write completes.
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_ANON_KEY;
    if (sbUrl && sbKey) {
      try {
        const parsed  = new URL(sbUrl);
        const payload = JSON.stringify({
          role:         role,
          score:        result.score || 0,
          ats:          result.ats || 0,
          green_skills: result.greenSkills || 0,
          exp_impact:   result.expImpact || 0,
          email:        null,
        });
        await new Promise((resolve) => {
          const reqSb = https.request({
            hostname: parsed.hostname,
            path:     "/rest/v1/analyses",
            method:   "POST",
            headers: {
              "Content-Type":   "application/json",
              "Content-Length": Buffer.byteLength(payload),
              "apikey":         sbKey,
              "Authorization":  `Bearer ${sbKey}`,
              "Prefer":         "return=minimal",
            },
          }, (r) => {
            let body = "";
            r.on("data", c => body += c);
            r.on("end", () => {
              if (r.statusCode >= 300) {
                console.error("[Supabase insert] status:", r.statusCode, "body:", body);
              } else {
                console.log("[Supabase insert] success");
              }
              resolve();
            });
          });
          reqSb.on("error", (e) => { console.error("[Supabase insert] error:", e.message); resolve(); });
          reqSb.write(payload);
          reqSb.end();
        });
      } catch(e) { console.error("[Supabase insert] exception:", e.message); }
    } else {
      console.error("[Supabase insert] missing env vars");
    }

    return res.status(200).json(result);
  } catch (e) {
    return res.status(502).json({ error: "AI analysis failed: " + e.message });
  }
};

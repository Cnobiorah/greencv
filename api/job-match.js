const https = require("https");

function callAnthropic(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const options = {
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    };
    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const text = (parsed.content||[]).map(b=>b.text||"").join("");
          const clean = text.replace(/```json|```/g,"").trim();
          try { resolve(JSON.parse(clean)); }
          catch { const m=clean.match(/\{[\s\S]*\}/); resolve(JSON.parse(m[0])); }
        } catch(e) { reject(new Error("Parse error: "+e.message)); }
      });
    });
    req.setTimeout(60000, () => { req.destroy(); reject(new Error("Timed out")); });
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const { cvText, jobDescription, role } = req.body || {};
  if (!cvText || !jobDescription) return res.status(400).json({ error: "Missing CV or job description" });

  const prompt = `You are an expert recruiter and career consultant specializing in green energy and sustainability roles.

Compare this CV against the job description and return a match analysis.

TARGET ROLE: ${role}

CV:
---
${cvText.slice(0, 4000)}
---

JOB DESCRIPTION:
---
${jobDescription.slice(0, 2000)}
---

Respond ONLY with valid JSON:
{
  "score": <integer 0-100 match percentage>,
  "verdict": "<one word or short phrase: Excellent Match / Good Match / Partial Match / Weak Match>",
  "summary": "<2 sentence summary of how well the CV matches>",
  "matched": ["<keyword or skill found in both CV and JD>", ...up to 8],
  "missing": ["<keyword or skill in JD but not in CV>", ...up to 8],
  "tips": ["<specific tip to improve match>", ...4 tips]
}`;

  try {
    const result = await callAnthropic(prompt, apiKey);
    return res.status(200).json(result);
  } catch(e) {
    return res.status(502).json({ error: "Job match failed: " + e.message });
  }
};

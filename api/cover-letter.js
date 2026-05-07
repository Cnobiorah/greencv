const https = require("https");

function callAnthropic(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
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

  const { cvText, role, jobDescription, name, company } = req.body || {};
  if (!cvText || !role) return res.status(400).json({ error: "Missing CV or role" });

  const prompt = `You are an expert career writer specializing in green energy and sustainability careers.

Write a professional, compelling cover letter for this candidate.

CANDIDATE NAME: ${name || "Applicant"}
TARGET ROLE: ${role}
COMPANY: ${company || "the company"}

CV SUMMARY:
---
${cvText.slice(0, 3000)}
---

${jobDescription ? `JOB DESCRIPTION:\n---\n${jobDescription.slice(0,1500)}\n---` : ""}

Write a complete, professional cover letter (3-4 paragraphs). It should:
- Open with a strong hook mentioning the role and company
- Highlight 2-3 key achievements from the CV that are relevant to green/sustainability
- Show passion for sustainability and the green economy
- Close with a confident call to action
- Be professional, warm, and authentic
- Be around 300-350 words

Respond ONLY with valid JSON:
{
  "coverLetter": "<the complete cover letter text, use \\n for line breaks>"
}`;

  try {
    const result = await callAnthropic(prompt, apiKey);
    return res.status(200).json(result);
  } catch(e) {
    return res.status(502).json({ error: "Cover letter generation failed: " + e.message });
  }
};

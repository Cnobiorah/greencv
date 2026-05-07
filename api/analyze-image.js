const https = require("https");

function callAnthropic(messages, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
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
          reject(new Error("Failed to parse response"));
        }
      });
    });

    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Timed out")); });
    req.on("error", e => reject(new Error(e.message)));
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const { base64, mime } = req.body || {};
  if (!base64 || !mime) return res.status(400).json({ error: "Missing image data" });

  // Validate mime type
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(mime)) return res.status(400).json({ error: "Invalid image type" });

  // Validate base64 size (max ~8MB)
  if (base64.length > 10 * 1024 * 1024) return res.status(400).json({ error: "Image too large" });

  try {
    const response = await callAnthropic([{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mime, data: base64 },
        },
        {
          type: "text",
          text: "This is an image of a CV or resume. Please extract ALL the text from it exactly as it appears. Include all sections: contact details, work experience, education, skills, certifications, etc. Return only the extracted text, nothing else.",
        },
      ],
    }], apiKey);

    const text = (response.content || []).map(b => b.text || "").join("").trim();
    if (!text || text.length < 20) {
      return res.status(422).json({ error: "Could not extract text from image" });
    }

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: "Image extraction failed: " + e.message });
  }
};

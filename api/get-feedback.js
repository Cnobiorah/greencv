// In-memory feedback store (resets on redeploy)
// For production, replace with a database like Supabase or MongoDB
const feedbackStore = global.feedbackStore || [];
global.feedbackStore = feedbackStore;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // POST — save feedback
  if (req.method === "POST") {
    const { rating, feature, improve, pay, email } = req.body || {};
    if (!rating) return res.status(400).json({ error: "Rating required" });

    // Only store feedback with 4-5 stars and has improvement text for display
    if (rating >= 4) {
      feedbackStore.push({
        rating,
        feature: feature || "",
        improve: improve || "",
        pay: pay || "",
        email: email ? email.split("@")[0] + "@***" : "", // anonymize
        date: new Date().toISOString(),
      });

      // Keep only last 50
      if (feedbackStore.length > 50) feedbackStore.shift();
    }

    return res.status(200).json({ success: true });
  }

  // GET — return latest feedback
  if (req.method === "GET") {
    // Return latest 6 with rating >= 4
    const feed = [...feedbackStore]
      .filter(f => f.rating >= 4)
      .reverse()
      .slice(0, 6);

    return res.status(200).json({ feedback: feed, total: feedbackStore.length });
  }

  return res.status(405).json({ error: "Method not allowed" });
};

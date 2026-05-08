module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ status: "warm", timestamp: new Date().toISOString() });
};

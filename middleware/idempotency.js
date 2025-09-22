const seen = new Map(); // simple in-memory store for sandbox

module.exports = function idempotency(req, res, next) {
  const key = req.get('Idempotency-Key') || req.body?.idempotency_key;
  if (!key) return res.status(400).json({ error: 'Missing idempotency key' });

  if (seen.has(key)) {
    // Same key → treat as already processed
    return res.status(200).json({ ok: true, duplicate: true });
  }
  // Mark key as seen for 5 minutes
  seen.set(key, Date.now());
  setTimeout(() => seen.delete(key), 5 * 60 * 1000);
  next();
};

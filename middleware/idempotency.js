// Idempotency middleware for money routes
const { supabase } = require('../config/providers');

const idempotencyMiddleware = async (req, res, next) => {
  // Only apply to POST/PUT/PATCH requests
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return next();
  }

  const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotency_key;
  
  if (!idempotencyKey) {
    return res.status(400).json({ error: 'Idempotency key required' });
  }

  // Check if we've seen this key before
  const { data: existing } = await supabase
    .from('idempotency_keys')
    .select('*')
    .eq('key', idempotencyKey)
    .single();

  if (existing) {
    // Return the cached response
    return res.status(existing.status_code).json(existing.response_body);
  }

  // Store the original json method
  const originalJson = res.json.bind(res);
  
  // Override json to capture response
  res.json = function(body) {
    // Store the idempotency key and response
    supabase
      .from('idempotency_keys')
      .insert({
        key: idempotencyKey,
        method: req.method,
        path: req.path,
        status_code: res.statusCode,
        response_body: body,
        created_at: new Date().toISOString()
      })
      .then(() => {})
      .catch(() => {}); // Don't fail the request if storage fails
    
    return originalJson(body);
  };

  next();
};

module.exports = idempotencyMiddleware;

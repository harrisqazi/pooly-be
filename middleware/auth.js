const { supabase } = require('../config/providers');

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_id', user.id)
    .single();

  if (!existingProfile) {
    const { data: newProfile } = await supabase
      .from('profiles')
      .insert({
        auth_id: user.id,
        type: 'human',
        email: user.email,
        current_ip: req.ip,
        last_seen: new Date().toISOString(),
        kyc_status: 'pending',
        status: 'active'
      })
      .select()
      .single();
    req.profile = newProfile;
  } else {
    await supabase
      .from('profiles')
      .update({
        last_seen_ip: existingProfile.current_ip,
        current_ip: req.ip,
        last_seen: new Date().toISOString()
      })
      .eq('id', existingProfile.id);
    req.profile = existingProfile;
  }

  next();
};

module.exports = authMiddleware;

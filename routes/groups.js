// Groups routes - create/join/list/delete
const express = require('express');
const router = express.Router();
const { supabase } = require('../config/providers');

/**
 * List all groups user is part of
 * GET /api/groups
 */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .or(`owner_id.eq.${req.user.id},member_ids.cs.{${req.user.id}}`)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get a specific group
 * GET /api/groups/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is member or owner
    if (data.owner_id !== req.user.id && !data.member_ids?.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized to view this group' });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create a new group
 * POST /api/groups
 */
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data, error } = await supabase
      .from('groups')
      .insert({
        name,
        description: description || null,
        owner_id: req.user.id,
        group_code: code,
        member_ids: [req.user.id],
        total_balance: 0
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Join a group by code
 * POST /api/groups/join
 */
router.post('/join', async (req, res) => {
  try {
    const { group_code } = req.body;

    if (!group_code) {
      return res.status(400).json({ error: 'Group code is required' });
    }

    // Find group by code
    const { data: group, error: findError } = await supabase
      .from('groups')
      .select('*')
      .eq('group_code', group_code.toUpperCase())
      .single();

    if (findError || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if already a member
    if (group.member_ids?.includes(req.user.id)) {
      return res.status(400).json({ error: 'Already a member of this group' });
    }

    // Add user to members
    const updatedMemberIds = [...(group.member_ids || []), req.user.id];

    const { data, error } = await supabase
      .from('groups')
      .update({ member_ids: updatedMemberIds })
      .eq('id', group.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete a group (owner only)
 * DELETE /api/groups/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    // Check if user is owner
    const { data: group, error: findError } = await supabase
      .from('groups')
      .select('owner_id')
      .eq('id', req.params.id)
      .single();

    if (findError || !group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner can delete the group' });
    }

    
    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, message: 'Group deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

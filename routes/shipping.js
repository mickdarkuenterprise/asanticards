const express = require('express');
const supabase = require('../lib/supabase');
const router = express.Router();

// Fetch all available shipping methods from Supabase
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('shipping_methods')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[error] Fetching shipping failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

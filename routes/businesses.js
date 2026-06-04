import express from 'express';
import sql from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const { Router } = express;

const router = Router();

// GET /api/businesses
router.get('/', requireAuth, async (req, res) => {
  try {
    const businesses = await sql`
      SELECT id, name, created_at
      FROM businesses
      WHERE user_id = ${req.userId}
      ORDER BY name ASC
    `;
    return res.json({ businesses });
  } catch (err) {
    console.error('[Businesses] GET error:', err);
    return res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// POST /api/businesses
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const [business] = await sql`
      INSERT INTO businesses (user_id, name)
      VALUES (${req.userId}, ${name.trim()})
      ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, created_at
    `;
    return res.status(201).json({ business });
  } catch (err) {
    console.error('[Businesses] POST error:', err);
    return res.status(500).json({ error: 'Failed to create business' });
  }
});

// DELETE /api/businesses/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await sql`
      DELETE FROM businesses
      WHERE id = ${req.params.id} AND user_id = ${req.userId}
      RETURNING id
    `;
    if (result.length === 0) return res.status(404).json({ error: 'Business not found' });
    return res.json({ message: 'Business deleted' });
  } catch (err) {
    console.error('[Businesses] DELETE error:', err);
    return res.status(500).json({ error: 'Failed to delete business' });
  }
});

export default router;
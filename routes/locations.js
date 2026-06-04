import express from 'express';
import sql from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const { Router } = express;

const router = Router({ mergeParams: true });

// GET /api/businesses/:businessId/locations
router.get('/', requireAuth, async (req, res) => {
  try {
    // Verify business belongs to user
    const [business] = await sql`
      SELECT id FROM businesses WHERE id = ${req.params.businessId} AND user_id = ${req.userId}
    `;
    if (!business) return res.status(404).json({ error: 'Business not found' });

    const locations = await sql`
      SELECT id, location_string, created_at
      FROM locations
      WHERE business_id = ${req.params.businessId}
      ORDER BY location_string ASC
    `;
    return res.json({ locations });
  } catch (err) {
    console.error('[Locations] GET error:', err);
    return res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// POST /api/businesses/:businessId/locations
router.post('/', requireAuth, async (req, res) => {
  try {
    const [business] = await sql`
      SELECT id FROM businesses WHERE id = ${req.params.businessId} AND user_id = ${req.userId}
    `;
    if (!business) return res.status(404).json({ error: 'Business not found' });

    const { location_string } = req.body;
    if (!location_string?.trim()) return res.status(400).json({ error: 'location_string is required' });

    const [location] = await sql`
      INSERT INTO locations (business_id, location_string)
      VALUES (${req.params.businessId}, ${location_string.trim()})
      ON CONFLICT (business_id, location_string) DO UPDATE SET location_string = EXCLUDED.location_string
      RETURNING id, location_string, created_at
    `;
    return res.status(201).json({ location });
  } catch (err) {
    console.error('[Locations] POST error:', err);
    return res.status(500).json({ error: 'Failed to create location' });
  }
});

// DELETE /api/locations/:id  (standalone route mounted in server.js)
export async function deleteLocation(req, res) {
  try {
    // Join through businesses to verify ownership
    const result = await sql`
      DELETE FROM locations l
      USING businesses b
      WHERE l.id = ${req.params.id}
        AND l.business_id = b.id
        AND b.user_id = ${req.userId}
      RETURNING l.id
    `;
    if (result.length === 0) return res.status(404).json({ error: 'Location not found' });
    return res.json({ message: 'Location deleted' });
  } catch (err) {
    console.error('[Locations] DELETE error:', err);
    return res.status(500).json({ error: 'Failed to delete location' });
  }
}

export default router;
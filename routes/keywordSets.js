import express from 'express';
import sql from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const { Router } = express;

const router = Router({ mergeParams: true });

// Helper: verify location belongs to user
async function verifyLocationOwnership(locationId, userId) {
  const [row] = await sql`
    SELECT l.id FROM locations l
    JOIN businesses b ON l.business_id = b.id
    WHERE l.id = ${locationId} AND b.user_id = ${userId}
  `;
  return !!row;
}

// GET /api/locations/:locationId/keyword-sets
router.get('/', requireAuth, async (req, res) => {
  try {
    const owned = await verifyLocationOwnership(req.params.locationId, req.userId);
    if (!owned) return res.status(404).json({ error: 'Location not found' });

    const sets = await sql`
      SELECT id, set_name, keywords, version, created_at
      FROM keyword_sets
      WHERE location_id = ${req.params.locationId}
      ORDER BY version ASC
    `;
    return res.json({ keyword_sets: sets });
  } catch (err) {
    console.error('[KeywordSets] GET error:', err);
    return res.status(500).json({ error: 'Failed to fetch keyword sets' });
  }
});

// POST /api/locations/:locationId/keyword-sets
router.post('/', requireAuth, async (req, res) => {
  try {
    const owned = await verifyLocationOwnership(req.params.locationId, req.userId);
    if (!owned) return res.status(404).json({ error: 'Location not found' });

    let { set_name, keywords } = req.body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: 'keywords must be a non-empty array' });
    }

    // Normalize keywords to lowercase
    keywords = keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);

    // Find-or-create: return existing set if same keywords exist (order-independent)
    const sorted = [...keywords].sort();
    const [existing] = await sql`
      SELECT id, set_name, keywords, version, created_at
      FROM keyword_sets
      WHERE location_id = ${req.params.locationId}
        AND (
          SELECT array_agg(k ORDER BY k) FROM unnest(keywords) k
        ) = (
          SELECT array_agg(k ORDER BY k) FROM unnest(${sorted}::text[]) k
        )
      LIMIT 1
    `;
    if (existing) return res.status(200).json({ keyword_set: existing });

    // Auto-version if set_name not provided
    if (!set_name?.trim()) {
      const [versionRow] = await sql`
        SELECT COALESCE(MAX(version), 0) + 1 AS next_version
        FROM keyword_sets WHERE location_id = ${req.params.locationId}
      `;
      set_name = `Set${versionRow.next_version}`;
    }

    const [versionRow] = await sql`
      SELECT COALESCE(MAX(version), 0) + 1 AS next_version
      FROM keyword_sets WHERE location_id = ${req.params.locationId}
    `;

    const [ks] = await sql`
      INSERT INTO keyword_sets (location_id, set_name, keywords, version)
      VALUES (${req.params.locationId}, ${set_name.trim()}, ${sorted}, ${versionRow.next_version})
      RETURNING id, set_name, keywords, version, created_at
    `;
    return res.status(201).json({ keyword_set: ks });
  } catch (err) {
    console.error('[KeywordSets] POST error:', err);
    return res.status(500).json({ error: 'Failed to create keyword set' });
  }
});

// PUT /api/keyword-sets/:id  (standalone, mounted in server.js)
export async function updateKeywordSet(req, res) {
  try {
    let { keywords, set_name } = req.body;

    if (keywords) {
      if (!Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ error: 'keywords must be a non-empty array' });
      }
      keywords = keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
    }

    // Verify ownership via join
    const [existing] = await sql`
      SELECT ks.id FROM keyword_sets ks
      JOIN locations l ON ks.location_id = l.id
      JOIN businesses b ON l.business_id = b.id
      WHERE ks.id = ${req.params.id} AND b.user_id = ${req.userId}
    `;
    if (!existing) return res.status(404).json({ error: 'Keyword set not found' });

    const [updated] = await sql`
      UPDATE keyword_sets
      SET
        keywords  = COALESCE(${keywords || null}::text[], keywords),
        set_name  = COALESCE(${set_name?.trim() || null}, set_name)
      WHERE id = ${req.params.id}
      RETURNING id, set_name, keywords, version, created_at
    `;
    return res.json({ keyword_set: updated });
  } catch (err) {
    console.error('[KeywordSets] PUT error:', err);
    return res.status(500).json({ error: 'Failed to update keyword set' });
  }
}

// DELETE /api/keyword-sets/:id  (standalone, mounted in server.js)
export async function deleteKeywordSet(req, res) {
  try {
    const result = await sql`
      DELETE FROM keyword_sets ks
      USING locations l, businesses b
      WHERE ks.id = ${req.params.id}
        AND ks.location_id = l.id
        AND l.business_id = b.id
        AND b.user_id = ${req.userId}
      RETURNING ks.id
    `;
    if (result.length === 0) return res.status(404).json({ error: 'Keyword set not found' });
    return res.json({ message: 'Keyword set deleted' });
  } catch (err) {
    console.error('[KeywordSets] DELETE error:', err);
    return res.status(500).json({ error: 'Failed to delete keyword set' });
  }
}

export default router;
import express from 'express';
import sql from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { checkRankings } from '../services/valueserp.js';

const { Router } = express;

const router = Router({ mergeParams: true });

// Helper: verify keyword set ownership and get context
async function getKeywordSetContext(keywordSetId, userId) {
  const [row] = await sql`
    SELECT ks.id, ks.keywords, ks.set_name,
           l.location_string,
           b.name AS business_name
    FROM keyword_sets ks
    JOIN locations l ON ks.location_id = l.id
    JOIN businesses b ON l.business_id = b.id
    WHERE ks.id = ${keywordSetId} AND b.user_id = ${userId}
  `;
  return row || null;
}

async function getUserApiKey(userId) {
  const [row] = await sql`
    SELECT api_key FROM users WHERE id = ${userId}
  `;
  return row?.api_key ?? null;
}

// POST /api/keyword-sets/:id/check
// Triggers a SerpAPI rank check for all keywords. Takes 2-5 min.
router.post('/:id/check', requireAuth, async (req, res) => {
  try {
    const ctx = await getKeywordSetContext(req.params.id, req.userId);
    if (!ctx) return res.status(404).json({ error: 'Keyword set not found' });

    console.log(`[Rankings] Starting check for "${ctx.business_name}" - ${ctx.keywords.length} keywords`);

    const apiKey = await getUserApiKey(req.userId);
    if (!apiKey) {
      return res.status(400).json({ error: 'Please configure your personal ValueSERP API key in Settings' });
    }

    const results = await checkRankings(ctx.keywords, ctx.business_name, ctx.location_string, apiKey);

    // Bulk insert all results
    if (results.length > 0) {
      for (const r of results) {
        await sql`
          INSERT INTO rank_results
            (keyword_set_id, keyword, position, business_title, address, phone, rating, reviews)
          VALUES
            (${req.params.id}, ${r.keyword}, ${r.position ?? null},
             ${r.businessTitle ?? null}, ${r.address ?? null},
             ${r.phone ?? null}, ${r.rating ?? null}, ${r.reviews ?? null})
        `;
      }
    }

    return res.json({
      message: 'Rankings checked successfully',
      keywordsChecked: results.length,
      results,
    });
  } catch (err) {
    console.error('[Rankings] Check error:', err);
    return res.status(500).json({ error: 'Failed to check rankings: ' + err.message });
  }
});

// GET /api/keyword-sets/:id/dates
// Returns all distinct check dates for a keyword set
router.get('/:id/dates', requireAuth, async (req, res) => {
  try {
    const ctx = await getKeywordSetContext(req.params.id, req.userId);
    if (!ctx) return res.status(404).json({ error: 'Keyword set not found' });

    const dates = await sql`
      SELECT DISTINCT
        DATE(checked_at) AS date,
        TO_CHAR(DATE(checked_at), 'DD Mon YYYY') AS display
      FROM rank_results
      WHERE keyword_set_id = ${req.params.id}
      ORDER BY date DESC
    `;

    return res.json({ dates });
  } catch (err) {
    console.error('[Rankings] Dates error:', err);
    return res.status(500).json({ error: 'Failed to fetch dates' });
  }
});

// GET /api/keyword-sets/:id/results?date=YYYY-MM-DD
// Returns results for a specific date (or latest if no date given)
router.get('/:id/results', requireAuth, async (req, res) => {
  try {
    const ctx = await getKeywordSetContext(req.params.id, req.userId);
    if (!ctx) return res.status(404).json({ error: 'Keyword set not found' });

    let targetDate = req.query.date;

    if (!targetDate) {
      // Get latest date
      const [latest] = await sql`
        SELECT DATE(checked_at) AS date
        FROM rank_results
        WHERE keyword_set_id = ${req.params.id}
        ORDER BY checked_at DESC LIMIT 1
      `;
      if (!latest) return res.json({ results: [], selectedDate: null, business: ctx.business_name });
      targetDate = latest.date;
    }

    const results = await sql`
      SELECT DISTINCT ON (keyword)
        keyword, position, business_title, address, phone, rating, reviews, checked_at
      FROM rank_results
      WHERE keyword_set_id = ${req.params.id}
        AND DATE(checked_at) = ${targetDate}
      ORDER BY keyword, checked_at DESC
    `;

    return res.json({
      business: ctx.business_name,
      location: ctx.location_string,
      setName: ctx.set_name,
      selectedDate: targetDate,
      totalKeywords: results.length,
      results: results.map((r) => ({
        keyword: r.keyword,
        currentPosition: r.position,
        businessTitle: r.business_title,
        address: r.address,
        phone: r.phone,
        rating: r.rating,
        reviews: r.reviews,
        checkedAt: r.checked_at,
      })),
    });
  } catch (err) {
    console.error('[Rankings] Results error:', err);
    return res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// GET /api/keyword-sets/:id/stats
// Computes best/worst/avg/trend for each keyword from all historical results
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const ctx = await getKeywordSetContext(req.params.id, req.userId);
    if (!ctx) return res.status(404).json({ error: 'Keyword set not found' });

    const stats = await sql`
      WITH ranked AS (
        SELECT
          keyword,
          position,
          checked_at,
          ROW_NUMBER() OVER (PARTITION BY keyword ORDER BY checked_at DESC) AS rn
        FROM rank_results
        WHERE keyword_set_id = ${req.params.id}
          AND position IS NOT NULL
      ),
      current_pos AS (
        SELECT keyword, position AS current_position
        FROM ranked WHERE rn = 1
      ),
      prev_pos AS (
        SELECT keyword, position AS prev_position
        FROM ranked WHERE rn = 2
      ),
      agg AS (
        SELECT
          keyword,
          MIN(position)                         AS best_position,
          MAX(position)                         AS worst_position,
          ROUND(AVG(position)::numeric, 1)      AS avg_position,
          COUNT(*)                              AS total_checks,
          MAX(checked_at)                       AS last_checked
        FROM rank_results
        WHERE keyword_set_id = ${req.params.id}
          AND position IS NOT NULL
        GROUP BY keyword
      )
      SELECT
        agg.keyword,
        cp.current_position,
        agg.best_position,
        agg.worst_position,
        agg.avg_position,
        agg.total_checks,
        agg.last_checked,
        CASE
          WHEN pp.prev_position IS NULL THEN '→'
          WHEN cp.current_position < pp.prev_position THEN '↑'
          WHEN cp.current_position > pp.prev_position THEN '↓'
          ELSE '→'
        END AS trend
      FROM agg
      JOIN current_pos cp ON agg.keyword = cp.keyword
      LEFT JOIN prev_pos pp ON agg.keyword = pp.keyword
      ORDER BY agg.keyword
    `;

    return res.json({
      business: ctx.business_name,
      setName: ctx.set_name,
      totalKeywords: stats.length,
      stats: stats.map((s) => ({
        keyword: s.keyword,
        currentPosition: s.current_position,
        bestPosition: s.best_position,
        worstPosition: s.worst_position,
        avgPosition: parseFloat(s.avg_position),
        totalChecks: parseInt(s.total_checks),
        lastChecked: s.last_checked,
        trend: s.trend,
      })),
    });
  } catch (err) {
    console.error('[Rankings] Stats error:', err);
    return res.status(500).json({ error: 'Failed to compute stats' });
  }
});

export default router;
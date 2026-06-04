import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import authRoutes from './routes/auth.js';
import businessRoutes from './routes/businesses.js';
import locationRoutes from './routes/locations.js';
import keywordSetRoutes from './routes/keywordSets.js';
import rankingRoutes from './routes/rankings.js';
import { requireAuth } from './middleware/auth.js';
import { deleteLocation } from './routes/locations.js';
import { updateKeywordSet, deleteKeywordSet } from './routes/keywordSets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(express.static(join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/businesses', businessRoutes);

// Nested: locations under businesses
app.use('/api/businesses/:businessId/locations', locationRoutes);

// Standalone location delete
app.delete('/api/locations/:id', requireAuth, deleteLocation);

// Nested: keyword sets under locations
app.use('/api/locations/:locationId/keyword-sets', keywordSetRoutes);

// Standalone keyword set update/delete
app.put('/api/keyword-sets/:id', requireAuth, updateKeywordSet);
app.delete('/api/keyword-sets/:id', requireAuth, deleteKeywordSet);

// Rankings (check, results, stats, dates) under keyword sets
app.use('/api/keyword-sets', rankingRoutes);

// ── SPA Fallback ──────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ GBP Rank Tracker running on http://localhost:${PORT}`);
});

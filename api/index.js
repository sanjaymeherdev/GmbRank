import express from 'express';
import cookieParser from 'cookie-parser';

import authRoutes from '../routes/auth.js';
import businessRoutes from '../routes/businesses.js';
import locationRoutes, { deleteLocation } from '../routes/locations.js';
import keywordSetRoutes, { updateKeywordSet, deleteKeywordSet } from '../routes/keywordSets.js';
import rankingRoutes from '../routes/rankings.js';
import { requireAuth } from '../middleware/auth.js';

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/businesses/:businessId/locations', locationRoutes);
app.delete('/api/locations/:id', requireAuth, deleteLocation);
app.use('/api/locations/:locationId/keyword-sets', keywordSetRoutes);
app.put('/api/keyword-sets/:id', requireAuth, updateKeywordSet);
app.delete('/api/keyword-sets/:id', requireAuth, deleteKeywordSet);
app.use('/api/keyword-sets', rankingRoutes);

export default app;

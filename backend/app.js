import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createStatsHandler } from './stats-data.js';


export const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createApp({ pool, clientId, origin, verifyGoogle }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Vary', 'Origin');
    if (req.headers.origin) {
      if (req.headers.origin !== origin) return res.status(403).json({ error: 'Origin not allowed.' });
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && req.headers.origin !== origin) {
      return res.status(403).json({ error: 'Origin required.' });
    }
    next();
  });
  app.use(rateLimit({ windowMs: 60000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'fantasy-huddle-api' });
  });
  app.get('/data/nfl/:season/:week', createStatsHandler({ pool }));
  app.get('/config', (req, res) => res.json({ googleClientId: clientId || null }));
  const authLimit = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  app.post('/auth/challenge', authLimit, async (req, res) => {
    if (!clientId) return res.status(503).json({ error: 'Google sign-in is being configured. Guest mode is available.' });
    const nonce = randomBytes(32).toString('base64url');
    await pool.query("INSERT INTO login_challenges VALUES ($1, now() + interval '10 minutes')", [hash(nonce)]);
    res.json({ nonce });
  });
  app.post('/auth/google', authLimit, async (req, res) => {
    if (!clientId) return res.status(503).json({ error: 'Google sign-in is being configured.' });
    if (typeof req.body?.credential !== 'string' || req.body.credential.length > 12000 ||
        typeof req.body.nonce !== 'string' || !/^[\w-]{43}$/.test(req.body.nonce)) {
      return res.status(400).json({ error: 'Invalid sign-in request.' });
    }
    let identity;
    try { identity = await verifyGoogle(req.body.credential); }
    catch { return res.status(401).json({ error: 'Google sign-in could not be verified. Please try again.' }); }
    if (!identity?.sub || identity.nonce !== req.body.nonce) return res.status(401).json({ error: 'Invalid sign-in challenge.' });
    const consumed = await pool.query('DELETE FROM login_challenges WHERE nonce_hash=$1 AND expires_at > now() RETURNING nonce_hash', [hash(req.body.nonce)]);
    if (!consumed.rowCount) return res.status(401).json({ error: 'Sign-in expired or already used. Please try again.' });
    const user = (await pool.query(`INSERT INTO users(id,google_sub,name) VALUES ($1,$2,$3)
      ON CONFLICT(google_sub) DO UPDATE SET name=excluded.name RETURNING id,name`,
      [randomUUID(), identity.sub, String(identity.name || 'Fantasy player').slice(0,100)])).rows[0];
    const token = randomBytes(32).toString('base64url');
    await pool.query("INSERT INTO sessions VALUES ($1,$2,now() + interval '12 hours')", [hash(token), user.id]);
    res.json({ token, user });
  });
  app.use(async (req, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer ([\w-]{43})$/)?.[1];
    if (!token) return res.status(401).json({ error: 'Sign in to use saved leagues.' });
    const user = (await pool.query(`SELECT u.id,u.name FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > now()`, [hash(token)])).rows[0];
    if (!user) return res.status(401).json({ error: 'Your session expired. Sign in again.' });
    req.user = user;
    req.tokenHash = hash(token);
    next();
  });
  app.get('/me', (req, res) => res.json({ user: req.user }));
  app.post('/auth/logout', async (req, res) => {
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [req.tokenHash]);
    res.sendStatus(204);
  });
  app.get('/leagues', async (req, res) => {
    const result = await pool.query('SELECT league_id,name FROM leagues WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ leagues: result.rows });
  });
  app.put('/leagues/:id', async (req, res) => {
    const id = req.params.id;
    const name = req.body?.name;
    if (!/^\d{8,24}$/.test(id) || typeof name !== 'string' || !name.trim() || name.length > 100) return res.status(400).json({error:'Invalid league.'});
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
      const count = (await db.query('SELECT count(*)::int AS n FROM leagues WHERE user_id=$1', [req.user.id])).rows[0].n;
      const existing = await db.query('SELECT 1 FROM leagues WHERE user_id=$1 AND league_id=$2', [req.user.id,id]);
      if (count >= 100 && !existing.rowCount) throw Object.assign(new Error('You can save up to 100 leagues.'), {status:409});
      await db.query('INSERT INTO leagues(user_id,league_id,name) VALUES($1,$2,$3) ON CONFLICT(user_id,league_id) DO UPDATE SET name=excluded.name', [req.user.id,id,name.trim()]);
      await db.query('COMMIT');
      res.json({league:{league_id:id,name:name.trim()}});
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  });
  app.delete('/leagues/:id', async (req, res) => {
    if (!/^\d{8,24}$/.test(req.params.id)) return res.status(400).json({error:'Invalid league.'});
    await pool.query('DELETE FROM leagues WHERE user_id=$1 AND league_id=$2', [req.user.id,req.params.id]);
    res.sendStatus(204);
  });
  app.use((error, req, res, next) => { console.error('Request failed:', error.code || error.message); res.status(error.status || 500).json({ error: error.status ? error.message : 'Server error. Try again.' }); });
  return app;
}

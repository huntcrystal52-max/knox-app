import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';

import { pool, runMigrations } from './db/index.js';
import authRoutes from './routes/auth.js';
import roomsRoutes from './routes/rooms.js';
import chatRoutes from './routes/chat.js';
import uploadRoutes from './routes/upload.js';
import buildRoutes from './routes/build.js';
import statusRoutes from './routes/status.js';
import houseRoutes from './routes/house.js';
import workshopRoutes from './routes/workshop.js';

const app = express();
// Railway sits in front of the app as a proxy. This tells Express to trust its
// "this connection is https" header, so the secure login cookie is actually sent.
app.set('trust proxy', 1);
const PgSession = connectPgSimple(session);

// True when running on Railway (or with NODE_ENV=production).
const isProd =
  process.env.NODE_ENV === 'production' ||
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_ENVIRONMENT_NAME;

// Raised from the default ~100kb so a phone photo, sent as a base64 data URI
// to the /api/upload route, doesn't get rejected before it even gets there.
app.use(express.json({ limit: '15mb' }));
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      // The front page and this server live on two different railway.app addresses,
      // so the browser counts them as different sites. 'none' (which requires
      // 'secure') lets the login cookie travel between them.
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
    },
  })
);

app.use('/auth', authRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/build', buildRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/house', houseRoutes);
app.use('/api/workshop', workshopRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;

runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Knox app server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to run migrations, server not started:', err);
    process.exit(1);
  });

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

const app = express();
const PgSession = connectPgSimple(session);

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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);

app.use('/auth', authRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/build', buildRoutes);

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

import { Router } from 'express';

const router = Router();

const DISCORD_API = 'https://discord.com/api';

function allowedIds() {
  return (process.env.ALLOWED_DISCORD_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

router.get('/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
  });
  res.redirect(`${DISCORD_API}/oauth2/authorize?${params.toString()}`);
});

router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Missing code from Discord.');
  }

  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Discord token exchange failed:', errText);
      return res.status(502).send('Could not log in with Discord.');
    }

    const tokenData = await tokenRes.json();

    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      return res.status(502).send('Could not fetch Discord profile.');
    }

    const discordUser = await userRes.json();

    const allowed = allowedIds();
    if (allowed.length > 0 && !allowed.includes(discordUser.id)) {
      return res.status(403).send('This Discord account is not allowed to use this app.');
    }

    req.session.user = {
      id: discordUser.id,
      username: discordUser.username,
      avatar: discordUser.avatar,
    };

    res.redirect(process.env.CLIENT_URL || '/');
  } catch (err) {
    console.error('Discord OAuth error:', err);
    res.status(500).send('Login failed.');
  }
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

export default router;

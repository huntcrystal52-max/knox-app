import { Router } from 'express';
import crypto from 'crypto';

const router = Router();

const CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const API_KEY = (process.env.CLOUDINARY_API_KEY || '').trim();
const API_SECRET = (process.env.CLOUDINARY_API_SECRET || '').trim();

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.log('[UPLOAD] Warning: one or more Cloudinary env vars are missing (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).');
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// POST /api/upload/image -> takes a base64 data URI from the browser and
// signs + sends it to Cloudinary's upload API directly with fetch, the same
// way every other external call in this project works (no SDK). This also
// means that if it fails, we get Cloudinary's actual response body in the
// logs instead of a generic wrapped error message.
router.post('/image', requireLogin, async (req, res) => {
  const { image } = req.body || {};
  if (!image || typeof image !== 'string' || !image.startsWith('data:')) {
    return res.status(400).json({ error: 'image (a data URI) is required' });
  }

  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    return res.status(500).json({ error: 'Cloudinary is not configured on the server.' });
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    // Only the non-file params get signed, sorted alphabetically, exactly as
    // Cloudinary's docs specify — this must match perfectly or the request
    // is rejected as an invalid signature.
    const paramsToSign = `folder=knox-app&timestamp=${timestamp}`;
    const signature = crypto.createHash('sha1').update(paramsToSign + API_SECRET).digest('hex');

    const body = new URLSearchParams({
      file: image,
      api_key: API_KEY,
      timestamp: String(timestamp),
      folder: 'knox-app',
      signature,
    });

    const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body,
    });

    const rawText = await cloudRes.text();

    if (!cloudRes.ok) {
      console.error('[UPLOAD] Cloudinary rejected the upload:', cloudRes.status, rawText.slice(0, 1000));
      return res.status(502).json({ error: 'Image upload failed.' });
    }

    let result;
    try {
      result = JSON.parse(rawText);
    } catch (e) {
      console.error('[UPLOAD] Cloudinary returned a non-JSON success response:', rawText.slice(0, 1000));
      return res.status(502).json({ error: 'Image upload failed.' });
    }

    res.json({ url: result.secure_url });
  } catch (err) {
    console.error('[UPLOAD] Upload error:', err.message);
    res.status(502).json({ error: 'Image upload failed.' });
  }
});

export default router;

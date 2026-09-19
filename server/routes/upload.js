import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';

const router = Router();

// Configured explicitly from three plain variables rather than relying on
// Cloudinary auto-parsing a single CLOUDINARY_URL string — that combined
// format is easy to mangle by hand (a stray space, a leftover character),
// and it silently produces this exact "Invalid Signature" error with no
// clearer clue. Three separate values are simpler to copy correctly.
// .trim() guards against a stray trailing space or newline sneaking in from
// a mobile copy-paste — invisible in the Railway variable field, but enough
// to break the signature check.
cloudinary.config({
  cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
  api_key: (process.env.CLOUDINARY_API_KEY || '').trim(),
  api_secret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
});

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.log('[UPLOAD] Warning: one or more Cloudinary env vars are missing (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).');
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  next();
}

// POST /api/upload/image -> takes a base64 data URI from the browser
// (read client-side with FileReader, no multipart parsing needed here),
// sends it to Cloudinary, and hands back the resulting URL. The images
// room then posts that URL into room_content like any other room entry —
// this endpoint only exists to do the upload step.
router.post('/image', requireLogin, async (req, res) => {
  const { image } = req.body || {};
  if (!image || typeof image !== 'string' || !image.startsWith('data:')) {
    return res.status(400).json({ error: 'image (a data URI) is required' });
  }

  try {
    const result = await cloudinary.uploader.upload(image, {
      folder: 'knox-app',
      resource_type: 'image',
    });
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(502).json({ error: 'Image upload failed.' });
  }
});

export default router;

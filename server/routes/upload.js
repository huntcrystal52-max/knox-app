import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';

const router = Router();

// cloudinary reads CLOUDINARY_URL from the environment automatically —
// nothing to configure here as long as that variable is set on this service.

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

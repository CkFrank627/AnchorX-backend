// routes/galleryRoutes.js
const express = require('express');
const router = express.Router();

const auth = require('../authMiddleware');          // 不改 authMiddleware.js :contentReference[oaicite:3]{index=3}
const Gallery = require('../models/Gallery');       // 你现在 routes 用的是 ../models/... :contentReference[oaicite:4]{index=4}
const User = require('../models/User');

// 把 images 兼容成 [{url}] 结构（兼容前端传 string[] 或 object[]）
function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => {
      if (!img) return null;
      if (typeof img === 'string') return { url: img };
      if (typeof img === 'object' && typeof img.url === 'string') {
        return { url: img.url, uploadedAt: img.uploadedAt };
      }
      return null;
    })
    .filter(Boolean);
}

// POST /api/galleries - 创建新的图库（必须登录，才能记录 owner/author）
router.post('/', auth, async (req, res) => {
  const { title, images } = req.body;
  if (!title || !images) {
    return res.status(400).json({ error: 'Missing required fields: title, images' });
  }

  try {
    const userId = req.userData.userId; // authMiddleware 会把 decoded 放到 req.userData :contentReference[oaicite:5]{index=5}
    const user = await User.findById(userId).select('username');

    const formattedImages = normalizeImages(images);
    if (formattedImages.length === 0) {
      return res.status(400).json({ error: 'images must be a non-empty array' });
    }

    const newGallery = new Gallery({
      title: String(title).trim(),
      owner: userId,
      author: user?.username ? user.username : '匿名用户',
      images: formattedImages,
    });

    const savedGallery = await newGallery.save();
    res.status(201).json(savedGallery);
  } catch (err) {
    console.error('创建图库失败:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/galleries/:id - 更新图库（必须登录且只能改自己的）
router.put('/:id', auth, async (req, res) => {
  try {
    const userId = req.userData.userId;
    const { id } = req.params;

    const g = await Gallery.findById(id);
    if (!g) return res.status(404).json({ error: 'Gallery not found' });

    // 只有 owner 才能编辑
    if (!g.owner || String(g.owner) !== String(userId)) {
      return res.status(403).json({ error: 'Forbidden: only owner can edit this gallery' });
    }

    const { title, images, coverUrl } = req.body;

    // 允许只改部分字段
    if (typeof title === 'string') {
      const t = title.trim();
      if (!t) return res.status(400).json({ error: 'title cannot be empty' });
      g.title = t;
    }

    if (images !== undefined) {
      const formattedImages = normalizeImages(images);
      if (formattedImages.length === 0) {
        return res.status(400).json({ error: 'images must be a non-empty array' });
      }
      g.images = formattedImages;
    }

    // 如果你 Gallery schema 里有 coverUrl 字段就写入；没有就忽略（不报错）
    if (typeof coverUrl === 'string' && coverUrl.trim()) {
      g.coverUrl = coverUrl.trim();
    }

    const saved = await g.save();
    res.status(200).json(saved);
  } catch (err) {
    console.error('更新图库失败:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/galleries - 获取所有图库（公开）
router.get('/', async (req, res) => {
  try {
    const allGalleries = await Gallery.find({})
      .populate('owner', 'username')
      .sort({ createdAt: -1 });

    const formattedGalleries = allGalleries.map((g) => {
      const ownerName = g.owner && g.owner.username ? g.owner.username : '';
      let author = (g.author || '').trim();
      if (!author || author === '匿名用户') author = ownerName || '匿名用户';

      return {
        _id: g._id,
        title: g.title,
        author,
        ownerId: g.owner ? (g.owner._id || g.owner) : null,
        image_count: Array.isArray(g.images) ? g.images.length : 0,
        cover_url: (g.coverUrl && String(g.coverUrl).trim())
  ? g.coverUrl
  : (g.images && g.images[0] ? g.images[0].url : ''),
        createdAt: g.createdAt,
      };
    });

    res.json(formattedGalleries);
  } catch (err) {
    console.error('获取图库列表失败:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/galleries/:id - 获取单个图库（公开）
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const g = await Gallery.findById(id).populate('owner', 'username');
    if (!g) return res.status(404).json({ error: 'Gallery not found' });

    const ownerName = g.owner && g.owner.username ? g.owner.username : '';
    let author = (g.author || '').trim();
    if (!author || author === '匿名用户') author = ownerName || '匿名用户';

    res.json({
      _id: g._id,
      title: g.title,
      author,
      ownerId: g.owner ? (g.owner._id || g.owner) : null,
      images: g.images || [],
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      coverUrl: (g.coverUrl || (g.images && g.images[0] ? g.images[0].url : '')),
    });
  } catch (err) {
    console.error('获取图库详情失败:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/galleries/:id - 删除图库（必须登录且只能删自己的）
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.userData.userId;
    const { id } = req.params;

    const g = await Gallery.findById(id);
    if (!g) return res.status(404).json({ error: 'Gallery not found' });

    // 只有 owner 才能删除
    if (!g.owner || String(g.owner) !== String(userId)) {
      return res.status(403).json({ error: 'Forbidden: only owner can delete this gallery' });
    }

    await g.deleteOne();
    res.status(200).json({ message: 'Gallery successfully deleted' });
  } catch (err) {
    console.error('删除图库失败:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

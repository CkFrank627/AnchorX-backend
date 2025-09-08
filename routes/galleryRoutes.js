// galleryRoutes.js

const express = require('express');
const router = express.Router();
const Gallery = require('../models/Gallery');

// POST /api/galleries - 创建新的图库
router.post('/', async (req, res) => {
  const { title, author, images } = req.body;
  
  if (!title || !images) {
    return res.status(400).json({ error: 'Missing required fields: title, images' });
  }

  try {
    // 关键修复：将图片 URL 数组转换为 Mongoose 期望的对象数组
    const formattedImages = images.map(url => ({ url: url }));

    // 使用 Mongoose 创建新文档
    const newGallery = new Gallery({
      title,
      author: author || '匿名用户', // 如果作者为空，则默认为“匿名用户”
      images: formattedImages // 使用格式化后的图片数组
    });

    const savedGallery = await newGallery.save();
    res.status(201).json(savedGallery);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/galleries - 获取所有图库
router.get('/', async (req, res) => {
  try {
    const allGalleries = await Gallery.find({}).sort({ createdAt: -1 });

    const formattedGalleries = allGalleries.map(gallery => ({
      _id: gallery._id, // 新增：返回图库的唯一ID
      title: gallery.title,
      author: gallery.author,
      // 从 images 数组中获取图片数量
      image_count: gallery.images.length,
      // 使用第一张图片的 URL 作为封面 URL
      cover_url: gallery.images[0]?.url || ''
    }));
    
    res.json(formattedGalleries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 新增：GET /api/galleries/:id - 根据ID获取单个图库
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const gallery = await Gallery.findById(id);

        if (!gallery) {
            // 如果没有找到图库，返回 404
            return res.status(404).json({ error: 'Gallery not found' });
        }

        res.json(gallery);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 新增：DELETE /api/galleries/:id - 根据ID删除图库
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Gallery.findByIdAndDelete(id);

        if (!result) {
            return res.status(404).json({ error: 'Gallery not found' });
        }
        
        res.status(200).json({ message: 'Gallery successfully deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
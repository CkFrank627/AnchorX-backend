// galleryRoutes.js

const express = require('express');
const router = express.Router();
// 引入 Mongoose 模型
const Gallery = require('../models/Gallery');

// POST /api/galleries - 创建新的图库
router.post('/', async (req, res) => {
  const { title, author, images, coverUrl } = req.body;
  
  if (!title || !images || !coverUrl) {
    // 检查前端传入的字段，确保images是数组且不为空
    return res.status(400).json({ error: 'Missing required fields: title, images, coverUrl' });
  }

  try {
    // 使用 Mongoose 创建新文档
    const newGallery = new Gallery({
      title,
      author: author || '匿名用户', // 如果作者为空，则默认为“匿名用户”
      images, // 直接保存图片URL数组
      coverUrl, // 保存封面URL
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
    // 使用 Mongoose 的 .find() 方法获取所有图库，并按创建时间倒序排序
    const allGalleries = await Gallery.find({}).sort({ createdAt: -1 });

    // 格式化数据以匹配前端的期望格式
    const formattedGalleries = allGalleries.map(gallery => ({
      title: gallery.title,
      author: gallery.author,
      // 从 images 数组中获取图片数量
      image_count: gallery.images.length,
      // 使用之前保存的封面URL
      cover_url: gallery.coverUrl
    }));
    
    res.json(formattedGalleries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
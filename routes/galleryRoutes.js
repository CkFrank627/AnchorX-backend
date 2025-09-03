const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/galleries - 创建新的图库
router.post('/', async (req, res) => {
  const { title, author, imageCount, coverUrl } = req.body;
  
  if (!title || !imageCount || !coverUrl) {
    return res.status(400).json({ error: 'Missing required fields: title, imageCount, coverUrl' });
  }

  const query = `
    INSERT INTO galleries (title, author, image_count, cover_url)
    VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;
  const values = [title, author || '匿名用户', imageCount, coverUrl];

  try {
    const { rows } = await db.query(query, values);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/galleries - 获取所有图库
router.get('/', async (req, res) => {
  const query = 'SELECT * FROM galleries ORDER BY created_at DESC;';

  try {
    const { rows } = await db.query(query);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
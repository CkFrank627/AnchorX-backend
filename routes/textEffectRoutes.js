// routes/textEffectRoutes.js
const express = require('express');
const router = express.Router();

const auth = require('../authMiddleware');
const TextEffect = require('../models/TextEffect');

// GET /api/text-effects - 公开列表
router.get('/', async (req, res) => {
  try {
    const list = await TextEffect.find({})
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = list.map((e) => ({
      _id: e._id,
      name: e.name,
      key: e.key,
      description: e.description || '',
      author: e.createdBy?.username || '匿名用户',
      authorId: e.createdBy?._id || null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));

    res.json(formatted);
  } catch (err) {
    console.error('读取文字特效列表失败:', err);
    res.status(500).json({ message: '读取文字特效列表失败' });
  }
});

// GET /api/text-effects/:id - 公开详情
router.get('/:id', async (req, res) => {
  try {
    const e = await TextEffect.findById(req.params.id)
      .populate('createdBy', 'username')
      .lean();

    if (!e) return res.status(404).json({ message: '文字特效不存在' });

    res.json({
      _id: e._id,
      name: e.name,
      key: e.key,
      description: e.description || '',
      code: e.code,
      author: e.createdBy?.username || '匿名用户',
      authorId: e.createdBy?._id || null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    });
  } catch (err) {
    console.error('读取文字特效详情失败:', err);
    res.status(500).json({ message: '读取文字特效详情失败' });
  }
});

// POST /api/text-effects - 上传（必须登录）
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.userData.userId;
    const { name, key, code, description } = req.body;

    if (!name || !key || !code || !String(code).trim()) {
      return res.status(400).json({ message: 'name、key、code 均不能为空' });
    }

    const created = await TextEffect.create({
      name: String(name).trim(),
      key: String(key).trim(),
      code: String(code),
      description: description ? String(description) : '',
      createdBy: userId,
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('创建文字特效失败:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: '该 key 已经被你使用过了，请换一个 key' });
    }
    res.status(500).json({ message: '创建文字特效失败' });
  }
});

// DELETE /api/text-effects/:id - 删除（必须登录且只能删自己的）
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.userData.userId;

    const deleted = await TextEffect.findOneAndDelete({
      _id: req.params.id,
      createdBy: userId,
    });

    if (!deleted) {
      return res.status(404).json({ message: '文字特效不存在，或你无权限删除' });
    }

    res.json({ message: '文字特效已删除' });
  } catch (err) {
    console.error('删除文字特效失败:', err);
    res.status(500).json({ message: '删除文字特效失败' });
  }
});

module.exports = router;

// routes/effectRoutes.js
const express = require('express');
const router = express.Router();
const auth = require('../authMiddleware');
const Effect = require('../models/Effect');

// GET /api/effects
// 列出当前用户的所有自定义特效
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.userData.userId;
    const effects = await Effect.find({ createdBy: userId }).sort({ updatedAt: -1 });
    res.json(effects);
  } catch (err) {
    console.error('获取自定义特效失败:', err);
    res.status(500).json({ message: '获取自定义特效失败' });
  }
});

// GET /api/effects/:id
// 获取当前用户的某一个自定义特效
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.userData.userId;
    const effect = await Effect.findOne({
      _id: req.params.id,
      createdBy: userId,
    });

    if (!effect) {
      return res.status(404).json({ message: '自定义特效不存在' });
    }

    res.json(effect);
  } catch (err) {
    console.error('获取自定义特效详情失败:', err);
    res.status(500).json({ message: '获取自定义特效详情失败' });
  }
});

// POST /api/effects
// 新建一个自定义特效
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.userData.userId;
    const { name, key, code, description } = req.body;

    if (!name || !key || !code) {
      return res.status(400).json({ message: 'name、key、code 均不能为空' });
    }

    const effect = await Effect.create({
      name,
      key,
      code,
      description: description || '',
      createdBy: userId,
    });

    res.status(201).json(effect);
  } catch (err) {
    console.error('创建自定义特效失败:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: '该 key 已经被你使用过了，请换一个 key' });
    }
    res.status(500).json({ message: '创建自定义特效失败' });
  }
});

// PATCH /api/effects/:id
// 更新一个自定义特效
router.patch('/:id', auth, async (req, res) => {
  try {
    const userId = req.userData.userId;
    const { name, key, code, description } = req.body;

    const effect = await Effect.findOne({
      _id: req.params.id,
      createdBy: userId,
    });

    if (!effect) {
      return res.status(404).json({ message: '自定义特效不存在' });
    }

    if (name !== undefined) effect.name = name;
    if (key !== undefined) effect.key = key;
    if (code !== undefined) effect.code = code;
    if (description !== undefined) effect.description = description;

    await effect.save();
    res.json(effect);
  } catch (err) {
    console.error('更新自定义特效失败:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: '该 key 已经被你使用过了，请换一个 key' });
    }
    res.status(500).json({ message: '更新自定义特效失败' });
  }
});

// DELETE /api/effects/:id
// 删除一个自定义特效
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.userData.userId;

    const effect = await Effect.findOneAndDelete({
      _id: req.params.id,
      createdBy: userId,
    });

    if (!effect) {
      return res.status(404).json({ message: '自定义特效不存在' });
    }

    res.json({ message: '自定义特效已删除' });
  } catch (err) {
    console.error('删除自定义特效失败:', err);
    res.status(500).json({ message: '删除自定义特效失败' });
  }
});

module.exports = router;

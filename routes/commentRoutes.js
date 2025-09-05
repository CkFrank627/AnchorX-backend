const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const jwt = require('jsonwebtoken');

// 认证中间件，确保只有登录用户可以发表评论
const auth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ message: '请先登录' });
    }
    try {
        const decoded = jwt.verify(token, 'YOUR_SECRET_KEY');
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ message: '令牌无效' });
    }
};

// GET: 获取某个作品特定句子的所有评论
router.get('/:workId/:sentenceId', async (req, res) => {
    try {
        const { workId, sentenceId } = req.params;
        const comments = await Comment.find({ workId, sentenceId }).populate('author', 'username').sort({ createdAt: 1 });
        res.json(comments);
    } catch (error) {
        res.status(500).json({ message: '获取评论失败', error: error.message });
    }
});

// POST: 提交新评论
router.post('/', auth, async (req, res) => {
    try {
        const { workId, sentenceId, content } = req.body;
        const newComment = new Comment({
            workId,
            sentenceId,
            author: req.userId,
            content
        });
        await newComment.save();
        // 返回新创建的评论，并包含作者信息
        const savedComment = await Comment.findById(newComment._id).populate('author', 'username');
        res.status(201).json(savedComment);
    } catch (error) {
        res.status(400).json({ message: '发表评论失败', error: error.message });
    }
});

module.exports = router;
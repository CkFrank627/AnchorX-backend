// commentRoutes.js

const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const jwt = require('jsonwebtoken');

// 认证中间件
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
        const token = req.header('Authorization')?.replace('Bearer ', '');
        let currentUserId = null;

        if (token) {
            try {
                const decoded = jwt.verify(token, 'YOUR_SECRET_KEY');
                currentUserId = decoded.userId;
            } catch (error) {
                currentUserId = null;
            }
        }

        const comments = await Comment.find({ workId, sentenceId })
            .populate('author', 'username')
            .sort({ createdAt: 1 });

        // 🔍 日志：获取评论时 likes 状态
        console.log('[GET COMMENTS]', comments.map(c => ({
            id: c._id.toString(),
            likesCount: (c.likes || []).length,
            likes: (c.likes || []).map(id => id.toString())
        })));

        const formattedComments = comments.map(comment => {
            const isLikedByCurrentUser =
                comment.likes && currentUserId
                    ? comment.likes.some(likeId => likeId.toString() === currentUserId)
                    : false;
            return {
                _id: comment._id,
                content: comment.content,
                author: comment.author.username,
                createdAt: comment.createdAt,
                likesCount: comment.likes ? comment.likes.length : 0,
                isLikedByCurrentUser
            };
        });

        res.json(formattedComments);
    } catch (error) {
        res.status(500).json({ message: '获取评论失败', error: error.message });
    }
});

// POST: 提交新评论
router.post('/', auth, async (req, res) => {
    try {
        const { workId, sentenceId, content } = req.body;

        // 🔍 新评论保存前，打印当前 sentenceId 下所有评论 likes 状态
        const before = await Comment.find({ sentenceId }).select('_id likes').lean();
        console.log('[NEW COMMENT] BEFORE', before.map(c => ({
            id: c._id.toString(),
            likesCount: (c.likes || []).length,
            likes: (c.likes || []).map(id => id.toString())
        })));

        const newComment = new Comment({
            workId,
            sentenceId,
            author: req.userId,
            content,
            likes: [] // 新评论 likes 应为空数组
        });

        await newComment.save();

        // 🔍 新评论保存后，再打印一次
        const after = await Comment.find({ sentenceId }).select('_id likes').lean();
        console.log('[NEW COMMENT] AFTER', after.map(c => ({
            id: c._id.toString(),
            likesCount: (c.likes || []).length,
            likes: (c.likes || []).map(id => id.toString())
        })));

        const savedComment = await Comment.findById(newComment._id).populate('author', 'username');
        res.status(201).json({
            _id: savedComment._id,
            content: savedComment.content,
            author: savedComment.author.username,
            createdAt: savedComment.createdAt,
            likesCount: 0,
            isLikedByCurrentUser: false // 新评论默认未点赞
        });
    } catch (error) {
        res.status(400).json({ message: '发表评论失败', error: error.message });
    }
});

// POST: 点赞/取消点赞
router.post('/:id/like', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        const comment = await Comment.findById(id);
        if (!comment) {
            return res.status(404).json({ message: '评论不存在' });
        }

        // 确保处理 ObjectId 的比较
        const index = comment.likes.findIndex(likeId => likeId.toString() === userId);

        if (index > -1) {
            comment.likes.splice(index, 1);
        } else {
            comment.likes.push(userId);
        }

        await comment.save();

        // 🔍 点赞操作后打印 likes 状态
        console.log('[LIKE]', {
            id: comment._id.toString(),
            likesCount: comment.likes.length,
            likes: comment.likes.map(id => id.toString())
        });

        res.json({
            likesCount: comment.likes.length,
            isLikedByCurrentUser: comment.likes.some(likeId => likeId.toString() === userId)
        });
    } catch (error) {
        res.status(500).json({ message: '点赞操作失败', error: error.message });
    }
});

module.exports = router;

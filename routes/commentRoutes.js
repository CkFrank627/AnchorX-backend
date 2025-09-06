// commentRoutes.js

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
// 这是一个公共接口，但如果用户已登录，我们会返回额外的点赞信息
router.get('/:workId/:sentenceId', async (req, res) => {
    try {
        const { workId, sentenceId } = req.params;
        const token = req.header('Authorization')?.replace('Bearer ', '');
        let currentUserId = null;

        // 尝试解析 token，但不阻止请求（即使没有登录也能看到评论）
        if (token) {
            try {
                const decoded = jwt.verify(token, 'YOUR_SECRET_KEY');
                currentUserId = decoded.userId;
            } catch (error) {
                // 无效 token，不返回用户ID
            }
        }

        const comments = await Comment.find({ workId, sentenceId })
            .populate('author', 'username')
            .sort({ createdAt: 1 });

        // 格式化评论数据，添加点赞状态
        const formattedComments = comments.map(comment => {
            const isLikedByCurrentUser = comment.likes.includes(currentUserId);
            return {
                _id: comment._id,
                content: comment.content,
                author: comment.author.username,
                createdAt: comment.createdAt,
                likesCount: comment.likes.length,
                isLikedByCurrentUser // 告诉前端当前用户是否点赞
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
        const newComment = new Comment({
            workId,
            sentenceId,
            author: req.userId,
            content
        });
        await newComment.save();
        // 返回新创建的评论，并包含作者信息
        const savedComment = await Comment.findById(newComment._id).populate('author', 'username');
        res.status(201).json({
            _id: savedComment._id,
            content: savedComment.content,
            author: savedComment.author.username,
            createdAt: savedComment.createdAt,
            likesCount: 0,
            isLikedByCurrentUser: true // 新评论默认已点赞
        });
    } catch (error) {
        res.status(400).json({ message: '发表评论失败', error: error.message });
    }
});

// 新增：POST 点赞/取消点赞评论
router.post('/:id/like', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId;

        const comment = await Comment.findById(id);
        if (!comment) {
            return res.status(404).json({ message: '评论不存在' });
        }

        const index = comment.likes.indexOf(userId);

        if (index > -1) {
            // 用户已点赞，执行取消点赞
            comment.likes.splice(index, 1);
        } else {
            // 用户未点赞，执行点赞
            comment.likes.push(userId);
        }

        await comment.save();
        res.json({ 
    likesCount: comment.likes.length,
    isLikedByCurrentUser: comment.likes.includes(userId) 
});

    } catch (error) {
        res.status(500).json({ message: '点赞操作失败', error: error.message });
    }
});

module.exports = router;
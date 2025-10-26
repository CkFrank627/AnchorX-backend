//commentRoutes.js

const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const Work = require('../models/Work');               // ✅ 引入作品模型
const Notification = require('../models/Notification'); // ✅ 引入通知模型
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

// GET: 获取某个作品下的所有评论
router.get('/work/:workId', async (req, res) => {
    try {
        const { workId } = req.params;
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

        const comments = await Comment.find({ workId })
            .populate('author', 'username')
            .sort({ createdAt: 1 });

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
                sentenceId: comment.sentenceId, // ✅ 新增：返回 sentenceId
                likesCount: comment.likes ? comment.likes.length : 0,
                isLikedByCurrentUser
            };
        });

        res.json(formattedComments);
    } catch (error) {
        res.status(500).json({ message: '获取作品评论失败', error: error.message });
    }
});

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
    console.log('[POST /api/comments] incoming:', req.body, 'userId:', req.userId);
    try {
        const { workId, sentenceId, content } = req.body;

        // ✅ 1. 统一 sentenceId 格式（自动标准化）
        const normalizedSentenceId = sentenceId.startsWith('s_')
            ? sentenceId
            : `s_${workId}_${sentenceId}`;

        // ✅ 2. 创建评论对象
        const newComment = new Comment({
            workId,
            sentenceId: normalizedSentenceId, // ✅ 改这里
            author: req.userId,               // ✅ 修正：使用 req.userId 而不是 req.userData
            content,
            likes: []
        });

        // ✅ 3. 保存到数据库
        const savedComment = await newComment.save();

        // ✅ 4. 给作品作者发通知（非必须，但保留你原来的逻辑）
        const commenterId = req.userId;
        const work = await Work.findById(savedComment.workId);

        if (work && work.author.toString() !== commenterId) {
            const sender = await User.findById(commenterId).select('username');
            const senderName = sender ? sender.username : '未知用户';

            const newNotification = new Notification({
                recipient: work.author,
                type: 'comment',
                sender: commenterId,
                comment: savedComment._id,
                message: `${senderName} 评论了你的作品 "${work.title}"`
            });
            await newNotification.save();
        }

        const populatedComment = await Comment.findById(savedComment._id)
            .populate('author', 'username');

        // ✅ 5. 返回成功响应
        res.status(201).json({
            _id: populatedComment._id,
            content: populatedComment.content,
            author: populatedComment.author.username,
            createdAt: populatedComment.createdAt,
            sentenceId: normalizedSentenceId, // ✅ 返回标准化 ID
            likesCount: 0,
            isLikedByCurrentUser: false
        });

    } catch (error) {
        console.error('[POST /api/comments] Error:', error);
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

        const index = comment.likes.findIndex(likeId => likeId.toString() === userId);

        if (index > -1) {
            comment.likes.splice(index, 1); // 取消点赞
        } else {
            comment.likes.push(userId); // 新点赞

            // ✅ 给评论作者发通知
            if (comment.author.toString() !== userId) {
                const newNotification = new Notification({
                    recipient: comment.author,
                    type: 'like',
                    sender: userId,
                    likedComment: comment._id,
                    message: `点赞了你的评论`
                });
                await newNotification.save();
            }
        }

        await comment.save();

        // 🔍 点赞操作日志
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

// 新增 GET: 获取某个作品下所有有评论的句子 ID 列表
// 这个接口用于前端判断哪些句子需要显示“评论”标识
router.get('/work/commented-sentences/:workId', async (req, res) => {
    try {
        const { workId } = req.params;
        
        // 确保 workId 是一个有效的 ObjectId
        if (!mongoose.Types.ObjectId.isValid(workId)) {
            return res.status(400).json({ message: '作品ID格式无效' });
        }

        // 使用聚合 (Aggregation) 来查找 workId 下所有不重复的 sentenceId
        const result = await Comment.aggregate([
            { $match: { workId: mongoose.Types.ObjectId(workId) } }, // 1. 过滤作品ID
            { $group: { _id: "$sentenceId" } }                        // 2. 按 sentenceId 分组
        ]);

        // 提取 sentenceId 数组
        const commentedSentenceIds = result.map(item => item._id);

        res.json(commentedSentenceIds);
    } catch (error) {
        // 在生产环境中，应记录 error.message
        res.status(500).json({ message: '获取有评论的句子ID失败' });
    }
});

module.exports = router;

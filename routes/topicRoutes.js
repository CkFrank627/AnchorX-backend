const express = require('express');
const router = express.Router();
const Topic = require('../models/Topic');
const Reply = require('../models/Reply');
const auth = require('../authMiddleware'); // 你的身份验证中间件
const mongoose = require('mongoose');

// ===================================
// 接口 1: 创建新主题 (需要登录)
// POST /api/topics
// ===================================
router.post('/', auth, async (req, res) => {
    try {
        const { title, content } = req.body;
        const author = req.userData.userId; // 从 auth 中间件获取用户 ID

        const newTopic = new Topic({
            title,
            content,
            author,
            lastReplyAt: new Date(),
            lastRepliedBy: author
        });

        await newTopic.save();

        // 返回新创建的主题 ID
        res.status(201).json({ message: '主题创建成功', topicId: newTopic._id });

    } catch (error) {
        console.error('创建主题失败:', error);
        res.status(400).json({ message: '创建主题失败', error: error.message });
    }
});

// ===================================
// 接口 2: 获取主题列表 (可分页)
// GET /api/topics?page=1&limit=10
// ===================================
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // 查询主题列表，并按最后回复时间降序排列 (即最新回复的在最上面)
        const topics = await Topic.find({})
            .sort({ lastReplyAt: -1, createdAt: -1 }) // 优先按最新回复时间，其次按创建时间
            .skip(skip)
            .limit(limit)
            .populate('author', 'username') // 关联查询作者的用户名
            .populate('lastRepliedBy', 'username') // 关联查询最后回复者的用户名
            .select('-content') // 列表页不返回完整内容，只返回摘要信息
            .exec();

        const totalTopics = await Topic.countDocuments({});

        res.json({
            topics,
            currentPage: page,
            totalPages: Math.ceil(totalTopics / limit),
            totalTopics
        });

    } catch (error) {
        console.error('获取主题列表失败:', error);
        res.status(500).json({ message: '获取主题列表失败', error: error.message });
    }
});

// ===================================
// 接口 3: 获取单个主题详情 (及分页回复)
// GET /api/topics/:topicId
// ===================================
router.get('/:topicId', async (req, res) => {
    const topicId = req.params.topicId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // 默认每页回复数
    const skip = (page - 1) * limit;

    try {
        // 1. 获取主题详情
        const topic = await Topic.findById(topicId)
            .populate('author', 'username')
            .select('-__v')
            .exec();

        if (!topic) {
            return res.status(404).json({ message: '找不到该主题' });
        }

        // 2. 增加浏览量 (不等待，异步执行)
        Topic.findByIdAndUpdate(topicId, { $inc: { viewsCount: 1 } }).exec();

        // 3. 获取主题的回复列表
        const replies = await Reply.find({ topic: topicId })
            .sort({ createdAt: 1 }) // 按时间升序排列
            .skip(skip)
            .limit(limit)
            .populate('author', 'username')
            .exec();

        const totalReplies = await Reply.countDocuments({ topic: topicId });

        res.json({
            topic,
            replies,
            replyPage: page,
            replyTotalPages: Math.ceil(totalReplies / limit),
            totalReplies
        });

    } catch (error) {
        console.error('获取主题详情失败:', error);
        res.status(500).json({ message: '获取主题详情失败', error: error.message });
    }
});

// ===================================
// 接口 4: 添加回复 (需要登录)
// POST /api/topics/:topicId/replies
// ===================================
router.post('/:topicId/replies', auth, async (req, res) => {
    const topicId = req.params.topicId;
    const { content } = req.body;
    const authorId = req.userData.userId;

    // 检查 topicId 是否是有效的 ObjectId
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
        return res.status(400).json({ message: '无效的主题ID' });
    }

    try {
        // 1. 确保主题存在
        const topic = await Topic.findById(topicId);
        if (!topic) {
            return res.status(404).json({ message: '回复的主题不存在' });
        }

        // 2. 创建新回复
        const newReply = new Reply({
            topic: topicId,
            content,
            author: authorId
        });
        await newReply.save();

        // 3. 更新主题的回复计数和最后回复信息 (原子操作 $inc)
        await Topic.findByIdAndUpdate(topicId, {
            $inc: { repliesCount: 1 },
            lastReplyAt: newReply.createdAt,
            lastRepliedBy: authorId
        });

        res.status(201).json({ message: '回复成功', replyId: newReply._id });

    } catch (error) {
        console.error('添加回复失败:', error);
        res.status(500).json({ message: '添加回复失败', error: error.message });
    }
});


module.exports = router;
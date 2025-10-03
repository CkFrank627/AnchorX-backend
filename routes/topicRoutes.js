const express = require('express');
const router = express.Router();
const Topic = require('../models/Topic');
const Reply = require('../models/Reply');
const auth = require('../authMiddleware'); // 你的身份验证中间件
const mongoose = require('mongoose');

// ===================================
// 新增：图片上传相关依赖和配置
// ===================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 定义文件存储的目标文件夹
// 确保这个目录与你的静态文件服务配置（例如在 app.js 中 app.use('/uploads', express.static('public/uploads'))）相匹配
const uploadDir = 'public/uploads';
// 确保目录存在
fs.mkdirSync(uploadDir, { recursive: true });

// 配置存储引擎
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); // 文件将存储在 'public/uploads' 目录
    },
    filename: function (req, file, cb) {
        // 创建一个唯一的文件名
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// 初始化 multer 中间件
const upload = multer({ storage: storage });

// ===================================
// 接口 0: 文件上传接口 (供富文本编辑器和图库使用)
// POST /api/topics/upload
// ===================================
router.post('/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: '没有上传文件' });
        }
        
        // 构建图片的公开访问 URL
        // 这里的 URL 结构需要和你配置静态文件服务的方式匹配
        // 例如：http://localhost:3000/uploads/image-1678888888-123.jpg
        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        
        // 将 URL 返回给前端 (前端需要这个 imageUrl)
        res.status(200).json({ message: '上传成功', imageUrl: imageUrl });
    } catch (error) {
        res.status(500).json({ message: '上传失败', error: error.message });
    }
});


// ===================================
// 接口 1: 创建新主题 (需要登录)
// POST /api/topics
// (新增对 section 的支持)
// ===================================
router.post('/', auth, async (req, res) => {
    try {
        const { title, content, section } = req.body; // <-- 接收 section
        const author = req.userData.userId; // 从 auth 中间件获取用户 ID

        const newTopic = new Topic({
            title,
            content,
            author,
            section, // <-- 保存 section
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
// 接口 2: 获取主题列表 (可分页、可按 section 筛选)
// GET /api/topics?page=1&limit=10&section=讨论区
// ===================================
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const section = req.query.section; // <-- 接收 section 筛选参数
        const skip = (page - 1) * limit;
        
        // 构建筛选条件
        const filter = {};
        if (section) {
            filter.section = section;
        }

        // 查询主题列表
        const topics = await Topic.find(filter) // <-- 应用筛选
            .sort({ lastReplyAt: -1, createdAt: -1 }) // 优先按最新回复时间，其次按创建时间
            .skip(skip)
            .limit(limit)
            .populate('author', 'username') // 关联查询作者的用户名
            .populate('lastRepliedBy', 'username') // 关联查询最后回复者的用户名
            .select('-content -likedBy') // 列表页不返回完整内容和点赞用户列表
            .exec();

        const totalTopics = await Topic.countDocuments(filter); // <-- 应用筛选

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
// (主题和回复现在包含 likesCount 和 likedBy)
// ===================================
router.get('/:topicId', async (req, res) => {
    const topicId = req.params.topicId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // 默认每页回复数
    const skip = (page - 1) * limit;

    try {
        // 1. 获取主题详情 (会自动带上 likesCount 和 likedBy)
        const topic = await Topic.findById(topicId)
            .populate('author', 'username')
            .select('-__v')
            .exec();

        if (!topic) {
            return res.status(404).json({ message: '找不到该主题' });
        }

        // 2. 增加浏览量 (不等待，异步执行)
        Topic.findByIdAndUpdate(topicId, { $inc: { viewsCount: 1 } }).exec();

        // 3. 获取主题的回复列表 (会自动带上 likesCount 和 likedBy)
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
// 接口 4: 添加回复 (保持不变)
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


// ===================================
// 接口 5: 点赞/取消点赞主题 (需要登录)
// POST /api/topics/:topicId/like
// ===================================
router.post('/:topicId/like', auth, async (req, res) => {
    const topicId = req.params.topicId;
    const userId = req.userData.userId; // 当前登录用户 ID

    try {
        const topic = await Topic.findById(topicId);
        if (!topic) {
            return res.status(404).json({ message: '主题不存在' });
        }

        // 检查用户是否已点赞
        const userLikedIndex = topic.likedBy.findIndex(id => id.toString() === userId.toString());

        if (userLikedIndex === -1) {
            // 用户尚未点赞，执行点赞操作
            topic.likedBy.push(userId);
            topic.likesCount += 1;
            await topic.save();
            return res.status(200).json({ message: '点赞成功', isLiked: true, likesCount: topic.likesCount });
        } else {
            // 用户已点赞，执行取消点赞操作
            topic.likedBy.splice(userLikedIndex, 1);
            topic.likesCount -= 1;
            await topic.save();
            return res.status(200).json({ message: '取消点赞成功', isLiked: false, likesCount: topic.likesCount });
        }
    } catch (error) {
        console.error('主题点赞操作失败:', error);
        res.status(500).json({ message: '主题点赞操作失败', error: error.message });
    }
});


// ===================================
// 接口 6: 点赞/取消点赞回复 (需要登录)
// POST /api/topics/replies/:replyId/like
// ===================================
router.post('/replies/:replyId/like', auth, async (req, res) => {
    const replyId = req.params.replyId;
    const userId = req.userData.userId; // 当前登录用户 ID

    try {
        const reply = await Reply.findById(replyId);
        if (!reply) {
            return res.status(404).json({ message: '回复不存在' });
        }

        // 检查用户是否已点赞
        const userLikedIndex = reply.likedBy.findIndex(id => id.toString() === userId.toString());

        if (userLikedIndex === -1) {
            // 用户尚未点赞，执行点赞操作
            reply.likedBy.push(userId);
            reply.likesCount += 1;
            await reply.save();
            return res.status(200).json({ message: '点赞成功', isLiked: true, likesCount: reply.likesCount });
        } else {
            // 用户已点赞，执行取消点赞操作
            reply.likedBy.splice(userLikedIndex, 1);
            reply.likesCount -= 1;
            await reply.save();
            return res.status(200).json({ message: '取消点赞成功', isLiked: false, likesCount: reply.likesCount });
        }
    } catch (error) {
        console.error('回复点赞操作失败:', error);
        res.status(500).json({ message: '回复点赞操作失败', error: error.message });
    }
});


module.exports = router;
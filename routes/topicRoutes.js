// topicRoutes.js

const express = require('express');
const router = express.Router();
const Topic = require('../models/Topic');
const Reply = require('../models/Reply');
const auth = require('../authMiddleware'); // 你的身份验证中间件
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Notification = require('../models/Notification'); // <--- 【修改点 3】引入 Notification 模型


// ===================================
// 图片上传相关配置 (保持不变)
// ===================================
const uploadDir = 'public/uploads';
try {
    fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
    // 忽略目录已存在的错误
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// ===================================
// 接口 0: 文件上传接口 (保持不变)
// POST /api/topics/upload
// ===================================
router.post('/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: '没有上传文件' });
        }
        
        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        
        res.status(200).json({ message: '上传成功', imageUrl: imageUrl });
    } catch (error) {
        res.status(500).json({ message: '上传失败', error: error.message });
    }
});


// ===================================
// 接口 1: 创建新主题 (保持不变)
// POST /api/topics
// ===================================
router.post('/', auth, async (req, res) => {
    try {
        const { title, content, section } = req.body;
        const author = req.userData.userId;

        const newTopic = new Topic({
            title,
            content,
            author,
            section,
            lastReplyAt: new Date(),
            lastRepliedBy: author
        });

        await newTopic.save();

        res.status(201).json({ message: '主题创建成功', topicId: newTopic._id });

    } catch (error) {
        console.error('创建主题失败:', error);
        res.status(400).json({ message: '创建主题失败', error: error.message });
    }
});

// ===================================
// 接口 2: 获取主题列表 (保持不变)
// GET /api/topics?page=1&limit=10&section=讨论区
// ===================================
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const section = req.query.section;
        const skip = (page - 1) * limit;
        
        const filter = {};
        if (section) {
            filter.section = section;
        }

        const topics = await Topic.find(filter)
            .sort({ lastReplyAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('author', 'username')
            .populate('lastRepliedBy', 'username')
            .select('-content -likedBy')
            .exec();

        const totalTopics = await Topic.countDocuments(filter);

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
// 接口 3: 获取单个主题详情 (【已修改】实现楼中楼嵌套及根回复分页)
// GET /api/topics/:topicId
// ===================================
router.get('/:topicId', async (req, res) => {
    const topicId = req.params.topicId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // 默认每页根回复数
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

        // 3. 【楼中楼逻辑】计算根回复总数 (用于分页)
        const totalRootReplies = await Reply.countDocuments({ topic: topicId, parentReply: null });

        // 4. 【楼中楼逻辑】获取当前页的根回复
        const rootReplies = await Reply.find({ topic: topicId, parentReply: null })
            .sort({ createdAt: 1 }) // 按时间升序排列
            .skip(skip)
            .limit(limit)
            .populate('author', 'username')
            .lean() // 使用 lean() 提高性能，方便数据操作
            .exec();

        // 5. 【楼中楼逻辑】获取所有与当前根回复相关的子回复
        const rootReplyIds = rootReplies.map(r => r._id);
        const nestedReplies = await Reply.find({ parentReply: { $in: rootReplyIds } })
            .sort({ createdAt: 1 })
            .populate('author', 'username')
            .lean()
            .exec();

        // 6. 【楼中楼逻辑】将子回复嵌套到对应的根回复中
        const repliesMap = new Map();
        rootReplies.forEach(reply => {
            reply.nestedReplies = []; // 创建前端所需的嵌套数组
            repliesMap.set(reply._id.toString(), reply);
        });

        nestedReplies.forEach(nested => {
            const parentId = nested.parentReply ? nested.parentReply.toString() : null;
            if (parentId && repliesMap.has(parentId)) {
                // 将子回复添加到父回复的 nestedReplies 数组中
                repliesMap.get(parentId).nestedReplies.push(nested);
            }
        });
        
        // **注意**：前端 Topic 列表的 repliesCount 仍显示的是所有评论总数，
        // 而此处的 totalReplies 仅用于分页计算（根回复数）。

        res.json({
            topic,
            replies: rootReplies, // 返回包含 nestedReplies 的根回复列表
            replyPage: page,
            replyTotalPages: Math.ceil(totalRootReplies / limit),
            totalReplies: totalRootReplies 
        });

    } catch (error) {
        console.error('获取主题详情失败:', error);
        res.status(500).json({ message: '获取主题详情失败', error: error.message });
    }
});

// ===================================
// 接口 4: 添加回复 (【已修改】支持楼中楼 parentId)
// POST /api/topics/:topicId/replies
// ===================================
router.post('/:topicId/replies', auth, async (req, res) => {
    const topicId = req.params.topicId;
    const { content, parentId } = req.body; // <-- 接收 parentId 用于楼中楼
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
        
        // 2. 验证并设置父回复 ID
        let parentReplyId = null;
        if (parentId) {
            if (!mongoose.Types.ObjectId.isValid(parentId)) {
                return res.status(400).json({ message: '无效的父回复ID' });
            }
            parentReplyId = parentId;
            
            // 确保父回复是根回复或已存在的回复
            // 实际应用中需要检查父回复是否存在，但此处略过以保持代码简洁
        }

        // 3. 创建新回复
        const newReply = new Reply({
            topic: topicId,
            content,
            author: authorId,
            parentReply: parentReplyId // <-- 保存楼中楼 ID
        });
        await newReply.save();

        // 4. 更新主题的回复计数和最后回复信息
        // 保持原逻辑：所有回复（包括楼中楼）都更新总计数和最后回复信息
        await Topic.findByIdAndUpdate(topicId, {
            $inc: { repliesCount: 1 }, // 计数器递增 (算上所有评论)
            lastReplyAt: newReply.createdAt,
            lastRepliedBy: authorId
        });

        // 5. 【修改点 4】创建通知 (回复主题的通知)
        // 只有当回复者不是主题作者本人时才创建通知
        if (topic.author.toString() !== authorId.toString()) {
            const newNotification = new Notification({
                recipient: topic.author, // 主题作者是通知接收者
                type: 'comment',
                sender: authorId, // 回复者是发送者
                comment: newReply._id, // 关联到新回复
                topic: topicId, // 关联到主题 (用于跳转)
                message: `回复了你的主题: ${topic.title.substring(0, 20)}...` 
            });
            await newNotification.save();
        }
        // *如果是楼中楼回复（parentId存在），还需通知被回复的楼层作者*
        if (parentReplyId) {
            const parentReply = await Reply.findById(parentReplyId).select('author');
            // 且被回复者不是当前回复者本人，也不是主题作者（避免重复通知）
            if (parentReply && 
                parentReply.author.toString() !== authorId.toString() &&
                parentReply.author.toString() !== topic.author.toString()) {

                const nestedNotification = new Notification({
                    recipient: parentReply.author,
                    type: 'comment',
                    sender: authorId,
                    comment: newReply._id,
                    topic: topicId,
                    message: `回复了你的评论: ${content.substring(0, 20)}...`
                });
                await nestedNotification.save();
            }
        }

        res.status(201).json({ message: '回复成功', replyId: newReply._id });

    } catch (error) {
        console.error('添加回复失败:', error);
        res.status(500).json({ message: '添加回复失败', error: error.message });
    }
});


// ===================================
// 接口 5: 点赞/取消点赞主题 (保持不变)
// POST /api/topics/:topicId/like
// ===================================
router.post('/:topicId/like', auth, async (req, res) => {
    const topicId = req.params.topicId;
    const userId = req.userData.userId;

    try {
        const topic = await Topic.findById(topicId);
        if (!topic) {
            return res.status(404).json({ message: '主题不存在' });
        }

        const userLikedIndex = topic.likedBy.findIndex(id => id.toString() === userId.toString());

        if (userLikedIndex === -1) {
            topic.likedBy.push(userId);
            topic.likesCount += 1;
            await topic.save();

            // 【修改点 5】创建通知 (主题点赞)
            // 只有当点赞者不是主题作者本人时才创建通知
            if (topic.author.toString() !== userId.toString()) {
                const newNotification = new Notification({
                    recipient: topic.author, // 主题作者是通知接收者
                    type: 'like',
                    sender: userId, // 点赞者是发送者
                    likedWork: topic._id, // 关联到被点赞的主题 (Work 可能是 Topic 的别名)
                    topic: topic._id, // 关联到主题 (用于跳转)
                    message: `点赞了你的主题: ${topic.title.substring(0, 20)}...`
                });

                await newNotification.save();
            }
            return res.status(200).json({ message: '点赞成功', isLiked: true, likesCount: topic.likesCount });
        } else {
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
// 接口 6: 点赞/取消点赞回复 (保持不变)
// POST /api/topics/replies/:replyId/like
// ===================================
router.post('/replies/:replyId/like', auth, async (req, res) => {
    const replyId = req.params.replyId;
    const userId = req.userData.userId;

    try {
        const reply = await Reply.findById(replyId);
        if (!reply) {
            return res.status(404).json({ message: '回复不存在' });
        }

        const userLikedIndex = reply.likedBy.findIndex(id => id.toString() === userId.toString());

        if (userLikedIndex === -1) {
            reply.likedBy.push(userId);
            reply.likesCount += 1;
            await reply.save();

// 【修改点 6】创建通知 (回复点赞)
            // 只有当点赞者不是回复作者本人时才创建通知
            if (reply.author.toString() !== userId.toString()) {
                // 需要获取主题标题用于消息内容
                const topic = await Topic.findById(reply.topic).select('title'); 
                const topicTitle = topic ? topic.title : '某主题';

                const newNotification = new Notification({
                    recipient: reply.author, // 回复作者是通知接收者
                    type: 'like',
                    sender: userId, // 点赞者是发送者
                    likedComment: reply._id, // 关联到被点赞的评论
                    topic: reply.topic, // 关联到主题 (用于跳转)
                    message: `点赞了你在主题《${topicTitle.substring(0, 20)}...》中的评论`
                });
                await newNotification.save();
            }

            return res.status(200).json({ message: '点赞成功', isLiked: true, likesCount: reply.likesCount });
        } else {
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
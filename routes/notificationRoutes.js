// notificationRoutes.js

const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('./authMiddleware'); // 确保你有这个认证中间件

// GET: 获取当前用户的所有通知
router.get('/', auth, async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.userId })
            .populate('sender', 'username') // 填充发送者信息
            .sort({ createdAt: -1 }) // 按时间倒序
            .limit(50); // 限制数量，避免数据过多

        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: '获取消息失败', error: error.message });
    }
});

// POST: 将通知标记为已读（可选，但推荐）
router.post('/mark-read/:id', auth, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipient: req.userId },
            { read: true },
            { new: true }
        );
        if (!notification) {
            return res.status(404).json({ message: '消息不存在' });
        }
        res.json(notification);
    } catch (error) {
        res.status(500).json({ message: '标记已读失败', error: error.message });
    }
});

module.exports = router;
// notificationRoutes.js

const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const auth = require('./authMiddleware'); // 确保你有这个认证中间件

// GET: 获取当前用户的所有通知
router.get('/', auth, async (req, res) => {
    // 【重要修复】从 req.userData 中获取 userId
    const currentUserId = req.userData ? req.userData.userId : null; 

    if (!currentUserId) {
        return res.status(401).json({ message: '授权失败：无法识别用户ID' });
    }

    try {
        const notifications = await Notification.find({ recipient: currentUserId }) // <--- 使用正确的变量名
            .populate('sender', 'username avatar') // ✅ 修改处：同时取出用户名和头像
            .sort({ createdAt: -1 })
            .limit(50);

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
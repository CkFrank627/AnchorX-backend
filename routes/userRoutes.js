// userRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const auth = require('../authMiddleware');
const bcrypt = require('bcrypt'); // 引入 bcrypt 用于新密码的哈希

// ✅ 新增：头像上传相关
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 注册
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = new User({ username, password });
        await user.save();
        res.status(201).json({ message: '注册成功' });
    } catch (error) {
        res.status(400).json({ message: '注册失败', error: error.message });
    }
});

// 登录
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: '用户名或密码不正确' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ message: '用户名或密码不正确' });
        }

        // ✅ 登录成功：记录本次活跃时间
        user.lastActiveAt = new Date();
        await user.save({ validateBeforeSave: false });

        // 生成 JWT
        const token = jwt.sign(
            { userId: user._id },
            'YOUR_SECRET_KEY',
            { expiresIn: '7d' }
        );

        // 也可以顺便把 lastActiveAt 返回给前端用
        res.json({
            message: '登录成功',
            token,
            user: {
                id: user._id,
                username: user.username,
                lastActiveAt: user.lastActiveAt
            }
        });
    } catch (error) {
        res.status(500).json({ message: '登录失败', error: error.message });
    }
});

// 更新个人资料（用户名 / 头像等）
router.patch('/profile', auth, async (req, res) => {
    try {
        const userId = req.userData.userId;
        const { username, avatarUrl } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: '用户不存在' });
        }

        // 可选：修改用户名
        if (username && typeof username === 'string' && username.trim()) {
            user.username = username.trim();
        }

        // ✅ 新增：保存头像链接（imgbb 或 /uploads/...）
        if (avatarUrl && typeof avatarUrl === 'string') {
            user.avatarUrl = avatarUrl;
        }

        await user.save({ validateBeforeSave: false });

        res.json({
            message: '资料更新成功',
            user: {
                id: user._id,
                username: user.username,
                avatarUrl: user.avatarUrl,
                lastActiveAt: user.lastActiveAt
            }
        });
    } catch (error) {
        console.error('更新用户资料失败:', error);
        res.status(500).json({ message: '更新用户资料失败', error: error.message });
    }
});



// 获取个人资料（受保护路由）
router.get('/profile', auth, async (req, res) => {
  console.log('Received GET request to /profile');
    try {
        const userId = req.userData.userId;
        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({ message: '找不到该用户' });
        }
        res.json({ message: '您已成功访问受保护的个人资料！', user });
    } catch (error) {
        res.status(500).json({ message: '无法获取个人资料', error: error.message });
    }
});

// --- 新增代码段 ---
// 修改密码（受保护路由）
router.patch('/change-password', auth, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const userId = req.userData.userId; // 从 auth 中间件获取用户ID

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: '找不到用户' });
        }

        // 验证旧密码
        const isMatch = await user.comparePassword(oldPassword);
        if (!isMatch) {
            return res.status(400).json({ message: '旧密码不正确' });
        }

        // 更新新密码。由于 User 模型中的 pre('save') 钩子，这里会自动进行哈希
        user.password = newPassword;
        await user.save();

        res.json({ message: '密码修改成功' });

    } catch (error) {
        res.status(500).json({ message: '密码修改失败', error: error.message });
    }
});

// ================== 头像上传 ==================

// 存储策略：保存到 /uploads/avatars 目录
const avatarStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, '..', 'uploads', 'avatars');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // userId-时间戳.png
        const ext = path.extname(file.originalname) || '.png';
        cb(null, req.userData.userId + '-' + Date.now() + ext);
    }
});

const avatarUpload = multer({
    storage: avatarStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter(req, file, cb) {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('只允许上传图片文件'));
        }
        cb(null, true);
    }
});

// 上传 / 更改头像（受保护路由）
// 前端使用字段名 avatar
router.post('/avatar', auth, avatarUpload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: '没有收到头像文件' });
        }

        const userId = req.userData.userId;

        // 生成可以被前端访问的 URL
        // 假设你的静态资源通过 app.use('/uploads', express.static('uploads')) 暴露
        const relativePath = `/uploads/avatars/${req.file.filename}`;

        const user = await User.findByIdAndUpdate(
            userId,
            { avatarUrl: relativePath },
            { new: true, select: 'username avatarUrl lastActiveAt' }
        );

        if (!user) {
            return res.status(404).json({ message: '找不到用户' });
        }

        res.json({
            message: '头像更新成功',
            avatarUrl: user.avatarUrl,
            user
        });
    } catch (error) {
        console.error('头像上传失败:', error);
        res.status(500).json({ message: '头像上传失败', error: error.message });
    }
});

// --- 新增代码段结束 ---

module.exports = router;
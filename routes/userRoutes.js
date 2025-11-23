// userRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const auth = require('../authMiddleware');
const bcrypt = require('bcrypt'); // 引入 bcrypt 用于新密码的哈希

// ✅ 头像上传相关
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ✅ 新增：调用 imgbb
const fetch = require('node-fetch');        // 确保已安装 node-fetch（建议 v2）
const { URLSearchParams } = require('url');

// 从环境变量读取 imgbb API key（推荐）
// Linux 上可以 export IMGBB_API_KEY=xxxxx
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || 040dbc9e6e680f321e09d9e05f447094;


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
// ✅ 改用内存存储：文件只存在于内存 buffer，不落地到本地硬盘
const avatarStorage = multer.memoryStorage();


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
// 上传 / 更改头像（受保护路由）
// 前端仍然使用字段名 avatar
router.post('/avatar', auth, avatarUpload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: '没有收到头像文件' });
        }

        if (!IMGBB_API_KEY || IMGBB_API_KEY === 'YOUR_IMGBB_API_KEY') {
            return res.status(500).json({ message: '服务器未配置 imgbb API key' });
        }

        const userId = req.userData.userId;

        // 1️⃣ 把内存中的文件 buffer 转成 base64（imgbb 支持 base64 上传）
        const imageBuffer = req.file.buffer;
        const base64Image = imageBuffer.toString('base64');

        // 2️⃣ 准备请求体，使用 x-www-form-urlencoded
        const params = new URLSearchParams();
        params.append('image', base64Image);

        // 3️⃣ 调用 imgbb API
        const imgbbResp = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: params
        });

        const imgbbData = await imgbbResp.json();

        if (!imgbbResp.ok || !imgbbData.success) {
            console.error('imgbb 上传失败:', imgbbData);
            return res.status(500).json({
                message: '上传到图床失败',
                detail: imgbbData
            });
        }

        // 4️⃣ 从返回中取出图片 URL（display_url / url 都可以）
        const imageUrl = imgbbData.data.display_url || imgbbData.data.url;

        // 5️⃣ 存到用户 avatarUrl 里
        const user = await User.findByIdAndUpdate(
            userId,
            { avatarUrl: imageUrl },
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
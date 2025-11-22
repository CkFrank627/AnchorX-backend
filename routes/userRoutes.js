// userRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const auth = require('../authMiddleware');
const bcrypt = require('bcrypt'); // 引入 bcrypt 用于新密码的哈希

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
// --- 新增代码段结束 ---

module.exports = router;
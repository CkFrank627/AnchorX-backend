// userRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// 引入你刚刚创建的身份验证中间件
const auth = require('../authMiddleware');

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

    // 生成 JWT
    const token = jwt.sign({ userId: user._id }, 'YOUR_SECRET_KEY', { expiresIn: '1h' });
    res.json({ message: '登录成功', token });
  } catch (error) {
    res.status(500).json({ message: '登录失败', error: error.message });
  }
});

// 添加一个受保护的路由，只有登录用户才能访问
router.get('/profile', auth, async (req, res) => {
    try {
        // 中间件已经将用户信息添加到 req.userData
        const userId = req.userData.userId;
        // 你可以根据 userId 从数据库获取用户详情
        const user = await User.findById(userId).select('-password'); // 不返回密码
        res.json({ message: '您已成功访问受保护的个人资料！', user });
    } catch (error) {
        res.status(500).json({ message: '无法获取个人资料', error: error.message });
    }
});

module.exports = router;
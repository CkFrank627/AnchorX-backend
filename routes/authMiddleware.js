// authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: '授权失败：没有提供令牌' });
    }

    const parts = authHeader.split(' ');
    const token = (parts.length === 2 && parts[0] === 'Bearer') ? parts[1] : null;
    if (!token) {
      return res.status(401).json({ message: '授权失败：令牌格式不正确' });
    }

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'JWT_SECRET 未配置' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    req.userData = decoded;
    req.userId = decoded.userId; // ✅ 额外挂一个，方便别的路由用

    // 更新 lastActiveAt（失败不影响主流程）
    if (decoded && decoded.userId) {
      try {
        await User.findByIdAndUpdate(
          decoded.userId,
          { lastActiveAt: new Date() },
          { new: false, validateBeforeSave: false }
        );
      } catch (e) {
        console.error('更新用户 lastActiveAt 失败:', e.message);
      }
    }

    next();
  } catch (error) {
    console.error('auth 中间件错误:', error.message);
    return res.status(401).json({ message: '授权失败：令牌无效' });
  }
};

module.exports = auth;
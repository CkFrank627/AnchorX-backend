// authMiddleware.js
const jwt = require('jsonwebtoken');
// ⚠️ 路径根据你项目实际情况调整：
// 如果 User.js 在 models 目录里，而且 authMiddleware.js 在 middleware 目录里，一般是：
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        // 从请求头的 Authorization 字段中获取 JWT
        // 格式通常是 "Bearer TOKEN_STRING"
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ message: '授权失败：没有提供令牌' });
        }

        const parts = authHeader.split(' ');
        const token = parts.length === 2 ? parts[1] : null;

        if (!token) {
            return res.status(401).json({ message: '授权失败：令牌格式不正确' });
        }

        // 验证令牌
        const decoded = jwt.verify(token, 'YOUR_SECRET_KEY'); // 这里的秘钥要和生成时的一致
        // decoded 内通常包含 { userId: 'xxx', iat: ..., exp: ... }
        req.userData = decoded;

        // ⭐ 新增：更新用户最近活跃时间
        // 不要因为这里失败就让整个请求 500，失败就算了，所以单独 try 一下
        if (decoded && decoded.userId) {
            try {
                await User.findByIdAndUpdate(
                    decoded.userId,
                    { lastActiveAt: new Date() },
                    { new: false, validateBeforeSave: false }
                );
            } catch (updateErr) {
                // 可以留一个日志（如果你有 logger）
                console.error('更新用户 lastActiveAt 失败:', updateErr.message);
                // 不 return，不影响正常业务逻辑
            }
        }

        // 继续执行下一个中间件或路由处理器
        next();
    } catch (error) {
        console.error('auth 中间件错误:', error.message);
        return res.status(401).json({ message: '授权失败：令牌无效' });
    }
};

module.exports = auth;

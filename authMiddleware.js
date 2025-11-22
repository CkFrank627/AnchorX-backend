// authMiddleware.js
const jwt = require('jsonwebtoken');
// ✅ 从项目根目录指向 ./models/User.js
const User = require('./models/User');

const auth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({ message: '授权失败：没有提供令牌' });
        }

        const parts = authHeader.split(' ');
        const token = parts.length === 2 ? parts[1] : null;

        if (!token) {
            return res.status(401).json({ message: '授权失败：令牌格式不正确' });
        }

        const decoded = jwt.verify(token, 'YOUR_SECRET_KEY');
        req.userData = decoded;

        // ⭐ 更新 lastActiveAt
        if (decoded && decoded.userId) {
            try {
                await User.findByIdAndUpdate(
                    decoded.userId,
                    { lastActiveAt: new Date() },
                    { new: false, validateBeforeSave: false }
                );
            } catch (updateErr) {
                console.error('更新用户 lastActiveAt 失败:', updateErr.message);
            }
        }

        next();
    } catch (error) {
        console.error('auth 中间件错误:', error.message);
        return res.status(401).json({ message: '授权失败：令牌无效' });
    }
};

module.exports = auth;

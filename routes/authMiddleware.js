// authMiddleware.js
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ message: '授权失败：缺少 Authorization 头' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: '授权失败：没有提供 token' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'YOUR_SECRET_KEY');
        req.userData = { userId: decoded.userId }; // ✅ 确保结构一致
        next();
    } catch (error) {
        console.error("JWT 验证失败:", error.message);
        return res.status(401).json({ message: '授权失败：令牌无效' });
    }
};

module.exports = auth;

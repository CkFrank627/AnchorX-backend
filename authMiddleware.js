// authMiddleware.js
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    try {
        // 从请求头的 Authorization 字段中获取 JWT
        // 格式通常是 "Bearer TOKEN_STRING"
        const token = req.headers.authorization.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: '授权失败：没有提供令牌' });
        }

        // 验证令牌
        const decoded = jwt.verify(token, 'YOUR_SECRET_KEY'); // 这里的秘钥要和生成时的一致
        req.userData = decoded; // 将解码后的用户信息添加到请求对象中
        next(); // 继续执行下一个中间件或路由处理器
    } catch (error) {
        return res.status(401).json({ message: '授权失败：令牌无效' });
    }
};

module.exports = auth;
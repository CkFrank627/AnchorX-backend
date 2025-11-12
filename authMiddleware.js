const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: '授权失败：缺少 Authorization 头' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: '授权失败：未提供 Token' });
    }

    // ✅ 用你的实际秘钥替换
    const decoded = jwt.verify(token, 'YOUR_SECRET_KEY');

    // ✅ 兼容不同 token 结构
    req.userData = {
      userId: decoded.userId || decoded._id || decoded.id,
      username: decoded.username,
      email: decoded.email
    };

    next();
  } catch (error) {
    console.error('JWT 验证失败:', error.message);
    return res.status(401).json({ message: '授权失败：令牌无效' });
  }
};

module.exports = auth;

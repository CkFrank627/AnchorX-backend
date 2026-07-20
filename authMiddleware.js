const User = require('./models/User');
const { getBearerTokenFromRequest, verifyAccessToken } = require('./services/authService');

const auth = async (req, res, next) => {
  try {
    const token = getBearerTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ message: '授权失败：令牌格式不正确' });
    }

    const decoded = verifyAccessToken(token);

    req.userData = decoded;
    req.userId = decoded.userId;

    if (decoded && decoded.userId) {
      try {
        await User.findByIdAndUpdate(
          decoded.userId,
          { lastActiveAt: new Date() },
          { new: false, validateBeforeSave: false }
        );
      } catch (error) {
        console.error('更新用户 lastActiveAt 失败:', error.message);
      }
    }

    next();
  } catch (error) {
    console.error('auth 中间件错误:', error.message);

    if (error.message === 'JWT_SECRET 未配置') {
      return res.status(500).json({ message: 'JWT_SECRET 未配置' });
    }

    return res.status(401).json({ message: '授权失败：令牌无效' });
  }
};

module.exports = auth;

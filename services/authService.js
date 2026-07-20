const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET 未配置');
  }
  return secret;
}

function getBearerTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }

  return null;
}

function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret());
}

function decodeRequestUser(req) {
  const token = getBearerTokenFromRequest(req);
  if (!token) return null;

  try {
    return verifyAccessToken(token);
  } catch (error) {
    return null;
  }
}

module.exports = {
  decodeRequestUser,
  getBearerTokenFromRequest,
  getJwtSecret,
  verifyAccessToken,
};

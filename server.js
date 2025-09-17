// server.js

// 1. 引入所需的模块
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// 引入 OpenCC 库
const { Converter } = require('opencc-js/full');

// 引入你创建的路由文件
const userRoutes = require('./routes/userRoutes');
const workRoutes = require('./routes/workRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const commentRoutes = require('./routes/commentRoutes');
const notificationRoutes = require('./routes/notificationRoutes'); 

// 2. 创建 Express 应用实例
const app = express();

// 定义服务器端口
const PORT = process.env.PORT || 3000;

// 3. 连接 MongoDB 数据库
const dbURI = process.env.MONGO_URI;

mongoose.connect(dbURI)
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.error('MongoDB connection error:', err));

// 4. 使用中间件
// 使用 CORS 中间件，允许多个前端地址进行跨域请求
const allowedOrigins = [
  'https://anchorx.ca',
  'https://anchorfrontend.netlify.app',
  'http://localhost:3000'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};
app.use(cors(corsOptions));

// 使用 Express 的内置中间件来解析 JSON 格式的请求体
app.use(express.json());

// 5. 路由设置

// 繁简转换 API 端点
// POST /api/convert-text
// POST /api/convert-text
// 引入 OpenCC
const OpenCC = require('opencc');
const s2t = new OpenCC('s2t.json'); // 简体 -> 繁体
const t2s = new OpenCC('t2s.json'); // 繁体 -> 简体

// 繁简转换中间件，根据 query 参数决定输出
app.use((req, res, next) => {
  // 重写 res.json
  const originalJson = res.json;
  res.json = function (data) {
    if (req.query.lang === 'cn') {
      // 转简体
      return Promise.resolve(t2s.convert(JSON.stringify(data)))
        .then(result => originalJson.call(this, JSON.parse(result)));
    } else if (req.query.lang === 'tw') {
      // 转繁体
      return Promise.resolve(s2t.convert(JSON.stringify(data)))
        .then(result => originalJson.call(this, JSON.parse(result)));
    } else {
      return originalJson.call(this, data); // 默认不转换
    }
  };
  next();
});


// 将所有以 '/api/users' 开头的请求，都交给 userRoutes 处理
app.use('/api/users', userRoutes);

// 将所有以 '/api/works' 开头的请求，都交给 workRoutes 处理
app.use('/api/works', workRoutes);    

// 将所有以 '/api/galleries' 开头的请求，都交给 galleryRoutes 处理
app.use('/api/galleries', galleryRoutes);

// 将所有以 '/api/comments' 开头的请求，都交给 commentRoutes 处理
app.use('/api/comments', commentRoutes);

// 注册通知路由
app.use('/api/notifications', notificationRoutes);

// 6. 启动服务器并监听指定端口
app.listen(PORT, () => {
  console.log(`服务器正在运行，请访问 http://localhost:${PORT}`);
});
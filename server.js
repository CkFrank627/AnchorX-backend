// server.js

// 1. 引入所需的模块
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// 引入 OpenCC 库
const OpenCC = require('opencc-js'); 

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
app.post('/api/convert-text', async (req, res) => {
    const { text, direction } = req.body;

    if (!text || !direction) {
        return res.status(400).json({ error: 'Missing text or direction in request body.' });
    }

    try {
        let convertedText = '';

        // 检查 direction 参数并选择正确的转换器
        if (direction === 't2s') {
            const converter = OpenCC.Converter({ from: 'hk', to: 'cn' });
            convertedText = converter(text);
        } else if (direction === 's2t') {
            const converter = OpenCC.Converter({ from: 'cn', to: 'hk' });
            convertedText = converter(text);
        } else {
            return res.status(400).json({ error: 'Invalid direction value.' });
        }

        res.json({ convertedText });
    } catch (error) {
        console.error('OpenCC failed to load converter:', error);
        res.status(500).json({ error: 'Failed to convert text.' });
    }
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
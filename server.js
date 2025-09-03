// server.js

// 1. 引入所需的模块
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); 
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// 引入数据库连接
const db = require('./db'); // 用于 PostgreSQL
// 引入你创建的路由文件
const userRoutes = require('./routes/userRoutes');
const workRoutes = require('./routes/workRoutes');
const readRoutes = require('./routes/readRoutes'); 
const galleryRoutes = require('./routes/galleryRoutes'); // 👈 修复了这里

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

// 配置 Multer，用于处理文件上传
const uploadDir = path.join(__dirname, 'uploads');
// 检查上传目录是否存在，不存在则创建
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); 
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });

// 设置静态文件服务，让 uploads 文件夹下的图片可以被公开访问
app.use('/uploads', express.static(uploadDir));

// 5. 路由设置
// 图片上传接口
app.post('/upload-image', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: '没有上传文件' });
    }

    const imageUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
    
    res.status(200).json({ success: true, url: imageUrl });
});

// 将所有以 '/api/users' 开头的请求，都交给 userRoutes 处理
app.use('/api/users', userRoutes);

// 将所有以 '/api/works' 开头的请求，都交给 workRoutes 处理
app.use('/api/works', workRoutes);

// 将所有以 '/api/read' 开头的请求，都交给 readRoutes 处理
app.use('/api/read', readRoutes);

// 新增：将所有以 '/api/galleries' 开头的请求，都交给 galleryRoutes 处理
app.use('/api/galleries', galleryRoutes);

// 6. 启动服务器并监听指定端口
app.listen(PORT, () => {
  console.log(`服务器正在运行，请访问 http://localhost:${PORT}`);
});
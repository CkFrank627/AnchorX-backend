// server.js

// 引入所需的模块
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); 

// 引入你创建的路由文件
const userRoutes = require('./routes/userRoutes');
const workRoutes = require('./routes/workRoutes');
const readRoutes = require('./routes/readRoutes'); // 确保引入 readRoutes

// 创建 Express 应用实例
const app = express();

// 定义服务器端口，如果环境变量中没有，则默认为 3000
const PORT = process.env.PORT || 3000;

// 连接 MongoDB 数据库
// 使用环境变量来获取 MongoDB Atlas 的连接字符串
const dbURI = process.env.MONGO_URI;

mongoose.connect(dbURI)
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.error('MongoDB connection error:', err));

// 使用中间件
// 1. 使用 CORS 中间件，允许多个前端地址进行跨域请求
const allowedOrigins = [
  'https://anchorx.ca',
  'https://anchorfrontend.netlify.app',
  'http://localhost:3000' // 开发时可以加上
];

const corsOptions = {
  origin: function (origin, callback) {
    // 允许来自白名单的请求，或者对于非浏览器的工具（如Postman），origin 为 undefined
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};
app.use(cors(corsOptions));

// 2. 使用 Express 的内置中间件来解析 JSON 格式的请求体
app.use(express.json());

// 路由设置
// 将所有以 '/api/users' 开头的请求，都交给 userRoutes 处理
app.use('/api/users', userRoutes);

// 将所有以 '/api/works' 开头的请求，都交给 workRoutes 处理
app.use('/api/works', workRoutes);

// 将所有以 '/api/read' 开头的请求，都交给 readRoutes 处理
app.use('/api/read', readRoutes);

// 启动服务器并监听指定端口
app.listen(PORT, () => {
  console.log(`服务器正在运行，请访问 http://localhost:${PORT}`);
});
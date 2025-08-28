// server.js

// 引入所需的模块
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // 引入 cors 模块

// 引入你创建的路由文件
const userRoutes = require('./routes/userRoutes');
const workRoutes = require('./routes/workRoutes');

// 创建 Express 应用实例
const app = express();

// 定义服务器端口，如果环境变量中没有，则默认为 3000
const PORT = process.env.PORT || 3000;

// 连接 MongoDB 数据库
mongoose.connect('mongodb://localhost:27017/ankou_app')
  .then(() => console.log('MongoDB 连接成功'))
  .catch(err => console.error('MongoDB 连接失败', err));

// 使用中间件
// 1. 使用 CORS 中间件，允许你的前端地址进行跨域请求
app.use(cors({
    origin: 'http://127.0.0.1:8080' // 确保这里是你的前端地址
}));

// 2. 使用 Express 的内置中间件来解析 JSON 格式的请求体
app.use(express.json());

// 路由设置
// 将所有以 '/api/users' 开头的请求，都交给 userRoutes 处理
app.use('/api/users', userRoutes);

// 将所有以 '/api/works' 开头的请求，都交给 workRoutes 处理
app.use('/api/works', workRoutes);

// 启动服务器并监听指定端口
app.listen(PORT, () => {
  console.log(`服务器正在运行，请访问 http://localhost:${PORT}`);
});
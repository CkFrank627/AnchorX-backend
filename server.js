// server.js

// 1. 引入所需的模块
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// 引入 OpenCC 库
const OpenCC = require('opencc-js');

// --- 新增: 全局转换器变量 ---
let t2sConverter; // 繁到简
let s2tConverter; // 简到繁
// -----------------------------

// 引入你创建的路由文件
const userRoutes = require('./routes/userRoutes');
const workRoutes = require('./routes/workRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const commentRoutes = require('./routes/commentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
// --- 新增：引入讨论区路由 ---
const topicRoutes = require('./routes/topicRoutes');


// 2. 创建 Express 应用实例
const app = express();

// 定义服务器端口
const PORT = process.env.PORT || 3000;


// 3. 连接 MongoDB 数据库
const dbURI = process.env.MONGO_URI;

mongoose.connect(dbURI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('MongoDB: 连接成功，超时时间已延长。');
})
.catch(err => {
    console.error('MongoDB: 连接失败，错误信息:', err);
});

// 4. 异步初始化 OpenCC 转换器（新增）
const initializeConverters = async () => {
    try {
        console.log('OpenCC: 正在初始化繁简转换器...');
        
        // 确保使用 await 等待初始化完成
        t2sConverter = await OpenCC.Converter({ from: 't', to: 's' }); 
        s2tConverter = await OpenCC.Converter({ from: 's', to: 't' });
        
        console.log('OpenCC: 繁简转换器初始化成功。');
    } catch (err) {
        console.error('OpenCC: 转换器初始化失败，服务将无法使用:', err);
        // 建议在这里退出程序或禁用转换服务
        // process.exit(1); 
    }
}

// 4. 使用中间件

// 使用 CORS 中间件，允许多个前端地址进行跨域请求
const allowedOrigins = [
  'https://zhidianworld.com',
  'https://anchorx.ca',
  'https://anchorfrontend.netlify.app',
  'http://localhost:3000'
];

const corsOptions = {
    origin: function (origin, callback) {
        // 允许列出的 origin，或者允许没有 origin 的请求 (如 Postman/CURL 或同源请求)
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


// 在這裡處理對網站根目錄的請求
app.get('/', (req, res) => {
  res.send('你的网站正在运行!');
});


// 5. 路由设置

// 繁简转换 API 端点
// POST /api/convert-text
// 注意：移除 async 关键字
app.post('/api/convert-text', (req, res) => {
    const { text, direction } = req.body;

    if (!text || !direction) {
        return res.status(400).json({ error: '缺少文本或转换方向' });
    }

    let converter;
    if (direction === 't2s') {
        converter = t2sConverter; // 使用已初始化的全局变量
    } else if (direction === 's2t') {
        converter = s2tConverter; // 使用已初始化的全局变量
    } else {
        return res.status(400).json({ error: '无效的转换方向' });
    }
    
    // **新增：检查转换器是否可用**
    if (!converter) {
        return res.status(503).json({ error: '繁简转换服务未就绪或初始化失败。' });
    }

    try {
        // 直接同步调用已初始化的转换器实例
        const convertedText = converter(text);
        res.json({ convertedText });
    } catch (error) {
        // 捕获运行时错误 (不太可能，但安全起见保留)
        console.error('繁简转换运行时失败:', error);
        res.status(500).json({ error: '繁简转换服务在执行时出错' });
    }
});

// 将所有以 '/api/users' 开头的请求，都交给 userRoutes 处理
app.use('/api/users', userRoutes);

// 将所有以 '/api/works' 开头的请求，都交给 workRoutes 处理
app.use('/api/works', workRoutes); 

// 将所有以 '/api/galleries' 开头的请求，都交给 galleryRoutes 处理
app.use('/api/galleries', galleryRoutes);

// 将所有以 '/api/comments' 开头的请求，都交给 commentRoutes 处理
app.use('/api/comments', commentRoutes); // 注意：原始代码中有重复注册，已保留一个

// 注册通知路由
app.use('/api/notifications', notificationRoutes); // 注意：原始代码中有重复注册，已保留一个

// --- 新增：注册讨论区路由 ---
app.use('/api/topics', topicRoutes); 


// 映射公共静态资源文件夹 /vendor_assets
// 这个 URL 路径 /vendor_assets 将指向项目目录下的 public/vendor_assets 文件夹
app.use('/vendor_assets', express.static(
    path.join(__dirname, 'public', 'vendor_assets')
));

// 配置静态文件服务
// 这会让 /uploads/some-image.jpg 指向 public/uploads/some-image.jpg 文件
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));


// ... (在文件末尾)

// 6. 启动服务器并监听指定端口

const startServer = async () => {
    // **确保在启动前等待转换器初始化**
    await initializeConverters(); 
    
    app.listen(PORT, () => {
        console.log(`服务器正在运行，请访问 http://localhost:${PORT}`);
    });
}

// 调用启动函数
startServer();
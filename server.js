require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// ✅ 1. 引入 opencc-js 的纯 JS 版本
const OpenCC = require('opencc-js');

// ✅ 2. 初始化两个转换器（同步即可，无需 await）
let t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' }); // 繁→简
let s2tConverter = OpenCC.Converter({ from: 'cn', to: 'tw' }); // 简→繁

// 引入路由文件
const userRoutes = require('./routes/userRoutes');
const workRoutes = require('./routes/workRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const commentRoutes = require('./routes/commentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
// 新增：讨论区路由
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
.then(() => console.log('MongoDB: 连接成功，超时时间已延长。'))
.catch(err => console.error('MongoDB: 连接失败，错误信息:', err));

// 4. 异步初始化 OpenCC 转换器
const initializeConverters = async () => {
    try {
        console.log('OpenCC: 正在初始化繁简转换器...');
        t2sConverter = await OpenCC.Converter({ from: 't', to: 's' });
        s2tConverter = await OpenCC.Converter({ from: 's', to: 't' });
        console.log('OpenCC: 繁简转换器初始化成功。');
    } catch (err) {
        console.error('OpenCC: 转换器初始化失败，服务将无法使用:', err);
        // process.exit(1);
    }
}

// 4. 使用中间件
const allowedOrigins = [
  'https://zhidianworld.com',
  'https://anchorx.ca',
  'https://anchorfrontend.netlify.app',
  'http://localhost:3000'
];

const corsOptions = {
    origin: (origin, callback) => {
        if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
};

app.use(cors(corsOptions));
app.use(express.json());

// 映射静态资源
app.use('/vendor_assets', express.static(path.join(__dirname, 'public', 'vendor_assets')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// 根路径测试
app.get('/', (req, res) => res.send('你的网站正在运行!'));

// 繁简转换接口
app.post('/api/convert-text', async (req, res) => {
  try {
    const { text, direction } = req.body;
    if (!text || !direction) return res.status(400).json({ error: '缺少 text 或 direction 参数' });

    let convertedText;
    if (direction === 't2s') convertedText = t2sConverter(text);
    else if (direction === 's2t') convertedText = s2tConverter(text);
    else return res.status(400).json({ error: '无效的 direction 参数' });

    res.json({ convertedText });
  } catch (err) {
    console.error('繁简转换失败:', err);
    res.status(500).json({ error: '繁简转换失败' });
  }
});

// 注册路由
app.use('/api/users', userRoutes);
app.use('/api/works', workRoutes);
app.use('/api/galleries', galleryRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/topics', topicRoutes);

// 启动服务器
const startServer = async () => {
    await initializeConverters();
    app.listen(PORT, () => {
        console.log(`服务器正在运行，请访问 http://localhost:${PORT}`);
    });
}

startServer();

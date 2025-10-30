// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const OpenCC = require('opencc-js');

// ======================================================
// 1️⃣ 创建 Express 实例（必须在使用 app 之前）
// ======================================================
const app = express();

// ======================================================
// 2️⃣ 设置视图引擎 (EJS SSR)
// ======================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ======================================================
// 3️⃣ 定义端口和数据库
// ======================================================
const PORT = process.env.PORT || 3000;
const dbURI = process.env.MONGO_URI;

// ======================================================
// 4️⃣ 连接 MongoDB
// ======================================================
mongoose.connect(dbURI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB 连接成功'))
.catch(err => console.error('❌ MongoDB 连接失败:', err));

// ======================================================
// 5️⃣ 初始化繁简转换器 (OpenCC)
// ======================================================
let t2sConverter, s2tConverter;

const initializeConverters = async () => {
  try {
    console.log('OpenCC: 正在初始化繁简转换器...');
    t2sConverter = await OpenCC.Converter({ from: 't', to: 's' });
    s2tConverter = await OpenCC.Converter({ from: 's', to: 't' });
    console.log('OpenCC: 初始化成功。');
  } catch (err) {
    console.error('OpenCC: 初始化失败:', err);
  }
};

// ======================================================
// 6️⃣ 中间件配置
// ======================================================
const allowedOrigins = [
  'https://zhidianworld.com',
  'https://anchorx.ca',
  'https://anchorfrontend.netlify.app',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  }
}));

app.use(express.json());

// ======================================================
// 7️⃣ 基础路由
// ======================================================
app.get('/', (req, res) => {
  res.send('✅ 网站正在运行中');
});

// ======================================================
// 8️⃣ 繁简转换接口
// ======================================================
app.post('/api/convert-text', async (req, res) => {
  try {
    const { text, direction } = req.body;
    if (!text || !direction)
      return res.status(400).json({ error: '缺少 text 或 direction 参数' });

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

// ======================================================
// 9️⃣ 引入 API 路由模块
// ======================================================
const userRoutes = require('./routes/userRoutes');
const workRoutes = require('./routes/workRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const commentRoutes = require('./routes/commentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const topicRoutes = require('./routes/topicRoutes');

app.use('/api/users', userRoutes);
app.use('/api/works', workRoutes);
app.use('/api/galleries', galleryRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/topics', topicRoutes);

// ======================================================
// 🔟 静态资源
// ======================================================
app.use('/vendor_assets', express.static(path.join(__dirname, 'public', 'vendor_assets')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ======================================================
// 1️⃣1️⃣ SSR 渲染文章页面
// ======================================================
app.get("/read/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const response = await fetch(`https://api.anchorx.ca/api/works/${id}`);
    if (!response.ok) throw new Error("无法获取文章");
    const work = await response.json();

    // ✅ 使用 EJS 模板渲染
    res.render("article", { work });
  } catch (err) {
    console.error(err);
    res.status(404).send("文章不存在或加载失败");
  }
});

// ======================================================
// 1️⃣2️⃣ 启动服务器
// ======================================================
const startServer = async () => {
  await initializeConverters();
  app.listen(PORT, () => console.log(`🚀 服务器运行中：http://localhost:${PORT}`));
};

startServer();

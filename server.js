//server.js

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
const textEffectRoutes = require('./routes/textEffectRoutes');
// 新增：讨论区路由
const topicRoutes = require('./routes/topicRoutes');
// 新增：自定义特效路由
const effectRoutes = require('./routes/effectRoutes');

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
  'http://localhost:3000',
  'https://preview.zhidianworld.com'
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

// ✅ 让“保存作品(大量 pages/content)”不再 413
const BODY_LIMIT = process.env.BODY_LIMIT || '50mb';
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// ✅ 可选：把 413 变成 JSON，前端更好提示
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      message: `内容过大（当前限制：${BODY_LIMIT}）。请先保存到本地以防丢失数据！！！减少单次保存体积或联系站长提高上限。`,
    });
  }
  next(err);
});


// ================== 全局请求计时中间件 ==================
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `⏱ [${req.method}] ${req.originalUrl} -> ${res.statusCode} | ${duration} ms`
    );
  });

  next();
});
// ====================================================

// 纯网络测试接口：不查数据库，只看网络 + 基础开销
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, time: Date.now() });
});


// 映射静态资源
app.use('/vendor_assets', express.static(path.join(__dirname, 'public', 'vendor_assets')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use(express.static(path.join(__dirname, 'public')));

// 根路径测试
app.get('/', (req, res) => res.send('你的网站正在运行!'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 繁简转换接口（稳定版：支持数组，避免前端靠 \n 对齐）
app.post('/api/convert-text', (req, res) => {
  try {
    const { direction } = req.body;
    if (!direction) return res.status(400).json({ error: '缺少 direction 参数' });

    let convertFn = null;
    if (direction === 't2s') convertFn = t2sConverter;
    if (direction === 's2t') convertFn = s2tConverter;
    if (!convertFn) return res.status(400).json({ error: '无效的 direction 参数' });

    // ✅ 新版：数组输入
    if (Array.isArray(req.body.texts)) {
      const texts = req.body.texts.map(v => (typeof v === 'string' ? v : ''));
      const convertedTexts = texts.map(t => convertFn(t));
      return res.json({ convertedTexts });
    }

    // ✅ 兼容旧版：单字符串输入
    const { text } = req.body;
    if (typeof text !== 'string') {
      return res.status(400).json({ error: '缺少 text 或 texts 参数' });
    }
    const convertedText = convertFn(text);
    return res.json({ convertedText });
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
app.use('/api/effects', effectRoutes);
app.use('/api/text-effects', textEffectRoutes);

app.get('/read/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const response = await fetch(`https://api.anchorx.ca/api/works/${id}`);
    if (!response.ok) throw new Error("无法获取作品数据");
    const work = await response.json();

    // 确保标题和内容可用
    if (!work || !work.title) throw new Error("无效作品数据");

    // 使用 EJS 渲染完整 HTML（SEO友好）
    res.render('article', { work });
  } catch (err) {
    console.error('SSR 渲染失败:', err);
    res.status(404).send('文章不存在或加载失败');
  }
});


// 启动服务器
const startServer = async () => {
    await initializeConverters();
    app.listen(PORT, () => {
        console.log(`服务器正在运行，请访问 http://localhost:${PORT}`);
    });
}

startServer();

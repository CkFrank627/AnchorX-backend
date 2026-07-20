//server.js

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const OpenCC = require('opencc-js');

const userRoutes = require('./routes/userRoutes');
const workRoutes = require('./routes/workRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const commentRoutes = require('./routes/commentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const textEffectRoutes = require('./routes/textEffectRoutes');
const topicRoutes = require('./routes/topicRoutes');
const effectRoutes = require('./routes/effectRoutes');
const Work = require('./models/Work');
const { loadWorkForRead } = require('./services/readWorkService');

let t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });
let s2tConverter = OpenCC.Converter({ from: 'cn', to: 'tw' });

const app = express();
const PORT = process.env.PORT || 3000;

const dbURI = process.env.MONGO_URI;
mongoose.connect(dbURI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB: 连接成功，超时时间已延长。'))
  .catch((err) => console.error('MongoDB: 连接失败，错误信息:', err));

const initializeConverters = async () => {
  try {
    console.log('OpenCC: 正在初始化繁简转换器...');
    t2sConverter = await OpenCC.Converter({ from: 't', to: 's' });
    s2tConverter = await OpenCC.Converter({ from: 's', to: 't' });
    console.log('OpenCC: 繁简转换器初始化成功。');
  } catch (err) {
    console.error('OpenCC: 转换器初始化失败，服务将无法使用:', err);
  }
};

const allowedOrigins = [
  'https://zhidianworld.com',
  'https://anchorx.ca',
  'https://anchorfrontend.netlify.app',
  'http://localhost:3000',
  'https://preview.zhidianworld.com',
];

const corsOptions = {
  origin: (origin, callback) => {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};

app.use(cors(corsOptions));

const BODY_LIMIT = process.env.BODY_LIMIT || '50mb';
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      message: `内容过大（当前限制：${BODY_LIMIT}）。请先保存到本地以防丢失数据！！！减少单次保存体积或联系站长提高上限。`,
    });
  }
  next(err);
});

app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`⏱ [${req.method}] ${req.originalUrl} -> ${res.statusCode} | ${duration} ms`);
  });

  next();
});

app.get('/api/ping', (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

app.use('/vendor_assets', express.static(path.join(__dirname, 'public', 'vendor_assets')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.send('你的网站正在运行!'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.post('/api/convert-text', (req, res) => {
  try {
    const { direction } = req.body;
    if (!direction) return res.status(400).json({ error: '缺少 direction 参数' });

    let convertFn = null;
    if (direction === 't2s') convertFn = t2sConverter;
    if (direction === 's2t') convertFn = s2tConverter;
    if (!convertFn) return res.status(400).json({ error: '无效的 direction 参数' });

    if (Array.isArray(req.body.texts)) {
      const texts = req.body.texts.map((value) => (typeof value === 'string' ? value : ''));
      const convertedTexts = texts.map((text) => convertFn(text));
      return res.json({ convertedTexts });
    }

    const { text } = req.body;
    if (typeof text !== 'string') {
      return res.status(400).json({ error: '缺少 text 或 texts 参数' });
    }

    return res.json({ convertedText: convertFn(text) });
  } catch (err) {
    console.error('繁简转换失败:', err);
    res.status(500).json({ error: '繁简转换失败' });
  }
});

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
    const accessWork = await Work.findById(req.params.id).select('isPublished');
    if (!accessWork || accessWork.isPublished !== true) {
      throw new Error('作品未发布');
    }

    const work = await loadWorkForRead(req.params.id, { incrementViews: true });
    if (!work || !work.title) {
      throw new Error('无效作品数据');
    }

    res.render('article', { work });
  } catch (err) {
    console.error('SSR 渲染失败:', err);
    res.status(404).send('文章不存在或加载失败');
  }
});

const startServer = async () => {
  await initializeConverters();
  app.listen(PORT, () => {
    console.log(`服务器正在运行，请访问 http://localhost:${PORT}`);
  });
};

startServer();

// server.js
// 文件路径：/home/myapp/AnchorX-backend/server.js

// -------------------------------------------------------------
// 1. 模块导入 (使用 ESM 语法)
// -------------------------------------------------------------
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
// 导入 opencc-js，它是一个纯 JS/WASM 库，无需编译
import * as OpenCC from 'opencc-js';

// 导入所有路由模块 (注意：必须包含 .js 扩展名)
import userRoutes from './routes/userRoutes.js';
import workRoutes from './routes/workRoutes.js';
import galleryRoutes from './routes/galleryRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import topicRoutes from './routes/topicRoutes.js';

dotenv.config();

// -------------------------------------------------------------
// 2. ESM 环境下的 __dirname 兼容性处理
// -------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------------------------------------------
// 3. OpenCC 转换器初始化 (同步调用)
// -------------------------------------------------------------
console.log('OpenCC: 正在初始化繁简转换器...');
// OpenCC.Converter 是同步函数，无需 await
const t2sConverter = OpenCC.Converter({ from: 't', to: 's' });
const s2tConverter = OpenCC.Converter({ from: 's', to: 't' });
console.log('OpenCC: 繁简转换器初始化成功。');

// -------------------------------------------------------------
// 4. Express 应用和 MongoDB 连接
// -------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB: 连接成功。'))
.catch(err => console.error('MongoDB: 连接失败:', err));

// -------------------------------------------------------------
// 5. 中间件和 CORS 设置
// -------------------------------------------------------------
const allowedOrigins = [
    'https://zhidianworld.com',
    'https://anchorx.ca',
    'https://anchorfrontend.netlify.app',
    'http://localhost:3000'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));
app.use(express.json());

// -------------------------------------------------------------
// 6. 根路由和繁简转换 API
// -------------------------------------------------------------
app.get('/', (req, res) => {
    res.send('你的网站正在运行!');
});

// 繁简转换 API 端点: POST /api/convert-text
app.post('/api/convert-text', (req, res) => {
    const { text, direction } = req.body;

    if (!text || !direction) {
        return res.status(400).json({ error: '缺少文本或转换方向' });
    }

    try {
        let convertedText;
        if (direction === 't2s') {
            convertedText = t2sConverter(text);
        } else if (direction === 's2t') {
            convertedText = s2tConverter(text);
        } else {
            return res.status(400).json({ error: '无效的转换方向' });
        }
        res.json({ convertedText });
    } catch (err) {
        console.error('OpenCC 转换错误:', err);
        // 如果转换器初始化成功，这里不应该失败
        res.status(500).json({ error: '转换失败' });
    }
});

// -------------------------------------------------------------
// 7. 注册其他路由
// -------------------------------------------------------------
app.use('/api/users', userRoutes);
app.use('/api/works', workRoutes);
app.use('/api/galleries', galleryRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/topics', topicRoutes);

// -------------------------------------------------------------
// 8. 静态资源
// -------------------------------------------------------------
app.use('/vendor_assets', express.static(path.join(__dirname, 'public', 'vendor_assets')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// -------------------------------------------------------------
// 9. 启动服务器
// -------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`服务器正在运行：http://localhost:${PORT}`);
});
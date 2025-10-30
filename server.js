// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// 2. 创建 Express 应用实例
const app = express();

// 设置视图引擎为 EJS
app.set('view engine', 'ejs');
// 设置模板文件夹路径
app.set('views', path.join(__dirname, 'views'));



// ✅ 1. 引入 opencc-js 的纯 JS 版本
const OpenCC = require('opencc-js');

// ✅ 2. 初始化两个转换器（同步即可，无需 await）
const t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' }); // 繁→简
const s2tConverter = OpenCC.Converter({ from: 'cn', to: 'tw' }); // 简→繁
// 引入 OpenCC 库


// 引入你创建的路由文件
const userRoutes = require('./routes/userRoutes');
const workRoutes = require('./routes/workRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const commentRoutes = require('./routes/commentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
// --- 新增：引入讨论区路由 ---
const topicRoutes = require('./routes/topicRoutes');


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

// 4. 异步初始化 OpenCC 转换器（原版逻辑）
const initializeConverters = async () => {
    try {
        console.log('OpenCC: 正在初始化繁简转换器...');
        
        // 确保使用 await 等待初始化完成 (这是您原版代码的写法)
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

// 映射公共静态资源文件夹 /vendor_assets
// 这个 URL 路径 /vendor_assets 将指向项目目录下的 public/vendor_assets 文件夹
app.use('/vendor_assets', express.static(
    path.join(__dirname, 'public', 'vendor_assets')
));


app.use(cors(corsOptions));

// 使用 Express 的内置中间件来解析 JSON 格式的请求体
app.use(express.json());


// 在這裡處理對網站根目錄的請求
app.get('/', (req, res) => {
    res.send('你的网站正在运行!');
});


// 5. 路由设置
// ✅ 3. 定义繁简转换接口
app.post('/api/convert-text', async (req, res) => {
  try {
    const { text, direction } = req.body;
    if (!text || !direction) {
      return res.status(400).json({ error: '缺少 text 或 direction 参数' });
    }

    let convertedText;
    if (direction === 't2s') {
      convertedText = t2sConverter(text);
    } else if (direction === 's2t') {
      convertedText = s2tConverter(text);
    } else {
      return res.status(400).json({ error: '无效的 direction 参数' });
    }

    return res.json({ convertedText });
  } catch (err) {
    console.error('繁简转换失败:', err);
    res.status(500).json({ error: '繁简转换失败' });
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

// --- 新增：注册讨论区路由 ---
app.use('/api/topics', topicRoutes); 



// 配置静态文件服务
// 这会让 /uploads/some-image.jpg 指向 public/uploads/some-image.jpg 文件
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

const fetch = require("node-fetch");

app.get("/read/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const response = await fetch(`https://api.anchorx.ca/api/works/${id}`);
    if (!response.ok) throw new Error("无法获取文章");
    const work = await response.json();

    // 渲染 EJS 模板
    res.render("article", { work });
  } catch (err) {
    console.error(err);
    res.status(404).send("文章不存在或加载失败");
  }
});



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
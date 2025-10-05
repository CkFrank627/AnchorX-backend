// server.js



// 1. 引入所需的模块

require('dotenv').config();

const express = require('express');

const mongoose = require('mongoose');

const cors = require('cors');


const path = require('path');


// 引入 OpenCC 库

const OpenCC = require('opencc-js');



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

    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {

      callback(null, true);

    } else {

      callback(new Error('Not allowed by CORS'));

    }

  }

};

// 在這裡處理對網站根目錄的請求
app.get('/', (req, res) => {
  res.send('你的網站正在運行!');
});


app.use(cors(corsOptions));



// 使用 Express 的内置中间件来解析 JSON 格式的请求体

app.use(express.json());



// 5. 路由设置



// 繁简转换 API 端点

// POST /api/convert-text

// POST /api/convert-text

app.post('/api/convert-text', async (req, res) => {

    const { text, direction } = req.body;



    if (!text || !direction) {

        return res.status(400).json({ error: '缺少文本或转换方向' });

    }



    try {

        let converter;

        if (direction === 't2s') {

            converter = OpenCC.Converter({ from: 'hk', to: 'cn' });

        } else if (direction === 's2t') {

            converter = OpenCC.Converter({ from: 'cn', to: 'hk' });

        } else {

            return res.status(400).json({ error: '无效的转换方向' });

        }

       

        const convertedText = converter(text);

        res.json({ convertedText });

    } catch (error) {

        console.error('繁简转换失败:', error);

        res.status(500).json({ error: '繁简转换服务出错' });

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

// 将所有以 '/api/comments' 开头的请求，都交给 commentRoutes 处理
app.use('/api/comments', commentRoutes);

// 注册通知路由
app.use('/api/notifications', notificationRoutes);

// --- 新增：注册讨论区路由 ---
app.use('/api/topics', topicRoutes); 


// --- 替换掉之前所有的 /static/node_modules 映射 ---

// 2. 新增：映射公共静态资源文件夹 /vendor_assets
// 这个 URL 路径 /vendor_assets 将指向项目目录下的 public/vendor_assets 文件夹
app.use('/vendor_assets', express.static(
    path.join(__dirname, 'public', 'vendor_assets')
));

// --- 新增：配置静态文件服务 ---
// 这会让 /uploads/some-image.jpg 指向 public/uploads/some-image.jpg 文件
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));




// 6. 启动服务器并监听指定端口

app.listen(PORT, () => {

  console.log(`服务器正在运行，请访问 http://localhost:${PORT}`);

});
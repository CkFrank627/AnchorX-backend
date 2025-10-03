//workRoutes.js

const express = require('express');
const router = express.Router();
const Work = require('../models/Work');
const jwt = require('jsonwebtoken');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 定义文件存储的目标文件夹
const uploadDir = 'public/uploads';
// 确保目录存在
fs.mkdirSync(uploadDir, { recursive: true });

// 配置存储引擎
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // 文件将存储在 'public/uploads' 目录
  },
  filename: function (req, file, cb) {
    // 创建一个唯一的文件名，防止重名覆盖
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// --- 新增：创建文件上传接口 ---
// 客户端会将图片 POST 到这个路由
router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '没有上传文件' });
    }
    // 构建图片的公开访问 URL
    // 注意：这里的 URL 结构需要和你配置静态文件服务的方式匹配
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    // 将 URL 返回给前端
    res.status(200).json({ message: '上传成功', imageUrl: imageUrl });
  } catch (error) {
    res.status(500).json({ message: '上传失败', error: error.message });
  }
});

// 认证中间件
const auth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ message: '请先登录' });
    }
    try {
        const decoded = jwt.verify(token, 'YOUR_SECRET_KEY');
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ message: '令牌无效' });
    }
};

// **新增：可选认证中间件**
// 如果有 token，解析并设置 req.userId，没有则继续
const optionalAuth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
        try {
            const decoded = jwt.verify(token, 'YOUR_SECRET_KEY');
            req.userId = decoded.userId;
        } catch (error) {
            // 令牌无效，但我们不中断请求，只把 userId 设为 null
            req.userId = null; 
        }
    } else {
        req.userId = null;
    }
    next();
};

// **新增：计算字数的辅助函数**
const calculateWordCount = (pages) => {
    if (!Array.isArray(pages) || pages.length === 0) {
        return 0;
    }

    return pages.reduce((sum, p) => {
        if (!p.content) return sum;
        if (typeof p.content === 'object' && Array.isArray(p.content.ops)) {
            // 如果是 Delta 格式，提取文本并计算长度
            const text = p.content.ops.map(op => op.insert || '').join('');
            // 排除图片和换行符等非文字内容
            const cleanText = text.replace(/[\n\r\t\s\u200B-\u200D\uFEFF]/g, '');
            return sum + cleanText.length;
        }
        return sum;
    }, 0);
};

// **接收 JSON 数据中的 coverImageUrl**
router.patch('/:id/cover', auth, async (req, res) => {
    try {
        const { coverImageUrl } = req.body;
        if (!coverImageUrl) {
            return res.status(400).json({ message: '缺少封面图片URL' });
        }

        const workId = req.params.id;
        const work = await Work.findById(workId);

        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        
        // 验证用户权限
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权修改此作品' });
        }
        
        // 更新作品的 coverImage 字段
        work.coverImage = coverImageUrl;
        await work.save();

        res.json({ message: '封面更新成功', coverImageUrl: work.coverImage });
    } catch (error) {
        res.status(500).json({ message: '更新封面失败', error: error.message });
    }
});

// 获取所有作品的路由 (用于阅读页面)
router.get('/all', async (req, res) => {
    try {
        const works = await Work.find().populate('author', 'username');
        res.json(works);
    } catch (error) {
        res.status(500).json({ message: '获取作品失败', error: error.message });
    }
});

// 获取当前登录用户的作品
router.get('/', auth, async (req, res) => {
    try {
        // 根据 token 解析得到的 userId 来筛选
        const works = await Work.find({ author: req.userId }).populate('author', 'username');
        res.json(works);
    } catch (error) {
        res.status(500).json({ message: '获取作品失败', error: error.message });
    }
});

// **修改：创建新作品**
router.post('/', auth, async (req, res) => {
    try {
        const { title, content } = req.body; // 新增：从请求体中获取 content
        const newWork = new Work({ 
            title, 
            author: req.userId,
            // 新增：根据请求中的内容计算初始字数
            content: content || [{ content: {} }],
            wordCount: calculateWordCount(content) 
        });
        await newWork.save();
        res.status(201).json(newWork);
    } catch (error) {
        res.status(400).json({ message: '创建作品失败', error: error.message });
    }
});

// **修改：更新作品的路由**
router.put('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body; 
        
        if (!Array.isArray(content)) {
            return res.status(400).json({ message: '内容格式不正确，需要是一个页面数组' });
        }

        // 新增：计算更新后的字数
        const newWordCount = calculateWordCount(content);

        const updatedWork = await Work.findOneAndUpdate(
            { _id: id, author: req.userId },
            // 更新内容、更新时间和字数
            { content, updatedAt: new Date(), wordCount: newWordCount },
            { new: true, timestamps: true }
        );

        if (!updatedWork) {
            return res.status(404).json({ message: '作品不存在或无权修改' });
        }

        res.json(updatedWork);
    } catch (error) {
        res.status(500).json({ message: '更新作品失败', error: error.message });
    }
});

// 删除作品
router.delete('/:id', auth, async (req, res) => {
    try {
        const work = await Work.findOneAndDelete({ _id: req.params.id, author: req.userId });
        if (!work) {
            return res.status(404).json({ message: '作品不存在或无权删除' });
        }
        res.json({ message: '作品删除成功' });
    } catch (error) {
        res.status(500).json({ message: '删除失败', error: error.message });
    }
});

// 修改：获取单个作品的路由（用于阅读页面），并增加浏览量
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const workId = req.params.id;

        // 使用 findByIdAndUpdate 原子性地增加浏览量，并返回更新后的文档
        const work = await Work.findByIdAndUpdate(
            workId,
            { $inc: { views: 1 } }, // 使用 $inc 操作符让 views 字段自增1
            { new: true } // 返回更新后的文档
        ).populate('author', 'username');

        if (!work) {
            return res.status(404).json({ message: '作品不存在' });
        }
        
        // 检查当前用户是否已点赞
        const isLikedByCurrentUser = req.userId ? work.likedBy.includes(req.userId) : false;
        
        // 返回作品信息，并附带点赞数、浏览量和用户点赞状态
        res.json({
            _id: work._id,
            title: work.title,
            author: work.author,
            content: work.content,
            views: work.views, // 返回更新后的浏览量
            likesCount: work.likesCount,
            isLikedByCurrentUser: isLikedByCurrentUser
        });
    } catch (error) {
        console.error('获取作品失败:', error);
        res.status(500).json({ message: '获取作品失败', error: error.message });
    }
});

// **新增：作品点赞/取消点赞的路由**
router.post('/:id/like', auth, async (req, res) => {
    try {
        const work = await Work.findById(req.params.id);
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }

        const userId = req.userId;
        const index = work.likedBy.indexOf(userId);
        
        if (index > -1) {
            // 用户已经点赞，执行取消点赞
            work.likedBy.splice(index, 1);
            work.likesCount -= 1;
        } else {
            // 用户尚未点赞，执行点赞
            work.likedBy.push(userId);
            work.likesCount += 1;
        }

        await work.save();

        res.json({
            likesCount: work.likesCount,
            isLikedByCurrentUser: index === -1 // 如果是新增点赞，则状态为 true
        });

    } catch (error) {
        console.error('Work like/unlike error:', error);
        res.status(500).json({ message: '点赞操作失败', error: error.message });
    }
});

// **新增：角色相关的 API 路由**

// 获取单个作品的所有角色
router.get('/:id/roles', auth, async (req, res) => {
    try {
        const work = await Work.findById(req.params.id);
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权查看此作品的角色' });
        }
        res.json(work.roles);
    } catch (error) {
        res.status(500).json({ message: '获取角色失败', error: error.message });
    }
});

// 为作品添加新角色
router.post('/:id/roles', auth, async (req, res) => {
    try {
        const { name, notes, color } = req.body;
        if (!name) {
            return res.status(400).json({ message: '角色名称不能为空' });
        }

        const work = await Work.findById(req.params.id);
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权修改此作品' });
        }

        // 创建新角色对象并推入数组
        work.roles.push({ name, notes, color });
        await work.save();

        // 返回新创建的角色对象，其 _id 由 MongoDB 自动生成
        const newRole = work.roles[work.roles.length - 1];
        res.status(201).json(newRole);
    } catch (error) {
        res.status(500).json({ message: '添加角色失败', error: error.message });
    }
});

// 更新作品中的某个角色
router.put('/:workId/roles/:roleId', auth, async (req, res) => {
    try {
        const { workId, roleId } = req.params;
        // 修改：从请求体中解构出 gallery 字段
        const { name, notes, color, gallery } = req.body;

        const work = await Work.findById(workId);
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权修改此作品' });
        }
        
        // 找到并更新指定的角色
        const roleToUpdate = work.roles.id(roleId);
        if (!roleToUpdate) {
            return res.status(404).json({ message: '角色未找到' });
        }

        roleToUpdate.name = name ?? roleToUpdate.name;
        roleToUpdate.notes = notes ?? roleToUpdate.notes;
        roleToUpdate.color = color ?? roleToUpdate.color;
        
        // 新增：如果请求体中包含 gallery 字段，则更新它
        // 使用 ?? 确保只有在 gallery 存在时才进行更新
        if (gallery !== undefined) {
            roleToUpdate.gallery = gallery;
        }

        await work.save();
        res.json(roleToUpdate);

    } catch (error) {
        res.status(500).json({ message: '更新角色失败', error: error.message });
    }
});

// 删除作品中的某个角色
router.delete('/:workId/roles/:roleId', auth, async (req, res) => {
    try {
        const { workId, roleId } = req.params;
        
        const work = await Work.findById(workId);
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权修改此作品' });
        }

        work.roles.pull({ _id: roleId });
        await work.save();

        res.json({ message: '角色删除成功' });
    } catch (error) {
        res.status(500).json({ message: '删除角色失败', error: error.message });
    }
});

// ... [在文件末尾或其他合适位置添加以下代码] ...

// ------------------------------------------------------------------
// **新增：骰子记录相关的 API 路由**
// ------------------------------------------------------------------

// 记录一次骰子使用情况 (POST /api/work/:id/dice-log)
router.post('/:id/dice-log', auth, async (req, res) => {
    try {
        const workId = req.params.id;
        // 接收前端发送的记录数据
        const { rollType, result, rollText } = req.body; 
        
        if (!rollType || typeof result !== 'number' || !rollText) {
            return res.status(400).json({ message: '缺少骰子记录所需的参数' });
        }

        const work = await Work.findById(workId);
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权修改此作品' });
        }

        // 创建新的骰子记录对象，使用服务器时间
        const newLog = {
            rollType,
            result,
            rollText,
            timestamp: new Date()
        };

        // 将新记录添加到数组最前面 (unshift)
        work.diceLog.unshift(newLog);

        // 可选：限制记录数量，例如只保留最新的 100 条，防止数据库字段过大
        if (work.diceLog.length > 100) {
             work.diceLog = work.diceLog.slice(0, 100);
        }

        await work.save();

        // 返回新记录和状态
        res.status(201).json({ message: '骰子记录成功', logEntry: newLog });

    } catch (error) {
        console.error('Dice log error:', error);
        res.status(500).json({ message: '记录骰子失败', error: error.message });
    }
});

// 获取作品的骰子记录 (GET /api/work/:id/dice-log)
router.get('/:id/dice-log', auth, async (req, res) => {
    try {
        const workId = req.params.id;

        // 只查询 diceLog 字段
        const work = await Work.findById(workId).select('diceLog author'); 
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权查看此作品的骰子记录' });
        }

        // 返回骰子记录列表
        res.json(work.diceLog);

    } catch (error) {
        res.status(500).json({ message: '获取骰子记录失败', error: error.message });
    }
});


module.exports = router;
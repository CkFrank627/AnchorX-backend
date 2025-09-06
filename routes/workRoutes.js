//workRoutes.js

const express = require('express');
const router = express.Router();
const Work = require('../models/Work');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 配置 Multer，用于处理文件上传
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'cover-' + uniqueSuffix + ext);
    }
});

const upload = multer({ storage: storage });

// **新增：上传和更新作品封面的路由**
router.patch('/:id/cover', auth, upload.single('coverImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: '未上传图片文件' });
        }

        const workId = req.params.id;
        const work = await Work.findById(workId);

        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        
        // 验证用户权限，确保是作品作者
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权修改此作品' });
        }
        
        // 检查并删除旧封面（可选，但推荐）
        if (work.coverImage) {
            const oldImagePath = path.join(uploadDir, path.basename(work.coverImage));
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }
        
        // 更新作品的 coverImage 字段
        work.coverImage = `https://lit-stream-78819-b3e5745b1632.herokuapp.com/uploads/${req.file.filename}`;
        await work.save();

        res.json({ message: '封面更新成功', coverImageUrl: work.coverImage });
    } catch (error) {
        res.status(500).json({ message: '更新封面失败', error: error.message });
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

// 新增：获取所有作品的路由 (用于阅读页面)
// 这个路由不带认证中间件，因此任何人都可以访问
router.get('/all', async (req, res) => {
    try {
        const works = await Work.find().populate('author', 'username');
        res.json(works);
    } catch (error) {
        res.status(500).json({ message: '获取作品失败', error: error.message });
    }
});

// 获取所有已发布的作品，任何人都可以访问
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


// 创建新作品
router.post('/', auth, async (req, res) => {
    try {
        const { title } = req.body;
        const newWork = new Work({ title, author: req.userId });
        await newWork.save();
        res.status(201).json(newWork);
    } catch (error) {
        res.status(400).json({ message: '创建作品失败', error: error.message });
    }
});

// 新增：更新作品的路由
// 处理 PUT 请求到 /api/works/:id
router.put('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;

        const updatedWork = await Work.findOneAndUpdate(
            { _id: id, author: req.userId },
            { content, updatedAt: new Date() },
            { new: true }
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

// 新增：获取单个作品的路由（用于阅读页面）
// 这个路由不需要认证，因此任何人都可以访问
router.get('/:id', async (req, res) => {
    try {
        // 修改：使用 populate 来获取作者的用户名
        const work = await Work.findById(req.params.id).populate('author', 'username');
        if (!work) {
            return res.status(404).json({ message: '作品不存在' });
        }
        res.json(work);
    } catch (error) {
        res.status(500).json({ message: '获取作品失败', error: error.message });
    }
});

module.exports = router;
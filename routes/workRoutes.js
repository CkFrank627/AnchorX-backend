// workRoutes.js

const express = require('express');
const router = express.Router();
const Work = require('../models/Work');
const jwt = require('jsonwebtoken');

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
// 这个路由不带认证中间件，因此任何人都可以访问
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

// 更新作品的路由
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

// 获取单个作品的路由（用于阅读页面）
router.get('/:id', async (req, res) => {
    try {
        // 使用 populate 来获取作者的用户名
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
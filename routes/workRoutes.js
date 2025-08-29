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

// 获取当前用户的所有作品
router.get('/', auth, async (req, res) => {
    try {
        const works = await Work.find({ author: req.userId });
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
        // 从 URL 参数中获取作品 ID
        const { id } = req.params;
        // 从请求体中获取更新内容
        const { content } = req.body;

        // 查找并更新作品，确保作品属于当前用户
        const updatedWork = await Work.findOneAndUpdate(
            { _id: id, author: req.userId }, // 查询条件：通过ID和作者ID双重验证
            { content, updatedAt: new Date() }, // 更新内容：设置新内容和更新时间
            { new: true } // 选项：返回更新后的文档
        );

        // 如果没有找到作品（可能ID错误或用户无权修改）
        if (!updatedWork) {
            return res.status(404).json({ message: '作品不存在或无权修改' });
        }

        // 成功响应，返回更新后的作品文档
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
        const work = await Work.findById(req.params.id);
        if (!work) {
            return res.status(404).json({ message: '作品不存在' });
        }
        res.json(work);
    } catch (error) {
        // 如果ID格式不正确，也会触发此处的错误
        res.status(500).json({ message: '获取作品失败', error: error.message });
    }
});

module.exports = router;
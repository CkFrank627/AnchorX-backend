// workRoutes.js

const express = require('express');
const router = express.Router();
const Work = require('../models/Work');
const Floor = require('../models/Floor'); // 新增引入 Floor 模型
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

// 获取所有作品的路由 (用于作品列表页面)
router.get('/', auth, async (req, res) => {
    try {
        const works = await Work.find({ author: req.userId }).populate('author', 'username');
        res.json(works);
    } catch (error) {
        res.status(500).json({ message: '获取作品失败', error: error.message });
    }
});

// 获取单个作品的路由（用于编辑器，会同时返回楼层和草稿箱内容）
router.get('/:id', auth, async (req, res) => {
    try {
        const workId = req.params.id;
        const work = await Work.findOne({ _id: workId, author: req.userId });
        if (!work) {
            return res.status(404).json({ message: '作品未找到或无权访问' });
        }

        const floors = await Floor.find({ parentWork: workId, isDraft: false }).sort('floorNumber');
        const draft = await Floor.findOne({ parentWork: workId, isDraft: true });

        res.json({
            work,
            floors,
            draft
        });
    } catch (error) {
        res.status(500).json({ message: '获取作品失败', error: error.message });
    }
});

// 创建新作品
router.post('/', auth, async (req, res) => {
    try {
        const { title } = req.body;
        // 1. 创建新作品记录
        const newWork = new Work({ title, author: req.userId });
        await newWork.save();

        // 2. 为新作品创建第一个楼层 (1F)
        const firstFloor = new Floor({
            content: '',
            floorNumber: 1,
            isDraft: false,
            parentWork: newWork._id,
            author: req.userId
        });
        await firstFloor.save();

        // 3. 为新作品创建草稿楼层
        const draftFloor = new Floor({
            content: '',
            floorNumber: 0, // 草稿箱的 floorNumber 设为 0
            isDraft: true,
            parentWork: newWork._id,
            author: req.userId
        });
        await draftFloor.save();

        // 4. 将草稿楼层的 ID 关联到作品上
        newWork.draftId = draftFloor._id;
        await newWork.save();

        // 关键修改：将作品、楼层和草稿一起返回
        res.status(201).json({
            work: newWork,
            floors: [firstFloor],
            draft: draftFloor
        });
    } catch (error) {
        res.status(400).json({ message: '创建作品失败', error: error.message });
    }
});

// 创建新楼层
router.post('/:id/floors', auth, async (req, res) => {
    try {
        const workId = req.params.id;
        const work = await Work.findOne({ _id: workId, author: req.userId });
        if (!work) {
            return res.status(404).json({ message: '作品未找到或无权操作' });
        }

        // 查找当前作品的最高楼层号
        const latestFloor = await Floor.findOne({ parentWork: workId, isDraft: false }).sort('-floorNumber');
        const nextFloorNumber = latestFloor ? latestFloor.floorNumber + 1 : 1;

        // 创建新楼层
        const newFloor = new Floor({
            content: '',
            floorNumber: nextFloorNumber,
            isDraft: false,
            parentWork: workId,
            author: req.userId
        });
        await newFloor.save();
        res.status(201).json(newFloor);
    } catch (error) {
        res.status(400).json({ message: '创建新楼层失败', error: error.message });
    }
});

// 更新楼层或草稿
router.put('/floors/:floorId', auth, async (req, res) => {
    try {
        const { floorId } = req.params;
        const { content } = req.body;

        const updatedFloor = await Floor.findOneAndUpdate(
            { _id: floorId, author: req.userId },
            { content, updatedAt: new Date() },
            { new: true }
        );

        if (!updatedFloor) {
            return res.status(404).json({ message: '楼层不存在或无权修改' });
        }
        res.json(updatedFloor);
    } catch (error) {
        res.status(500).json({ message: '更新楼层失败', error: error.message });
    }
});

// 删除楼层或草稿
router.delete('/floors/:floorId', auth, async (req, res) => {
    try {
        const floor = await Floor.findOneAndDelete({ _id: req.params.floorId, author: req.userId });
        if (!floor) {
            return res.status(404).json({ message: '楼层不存在或无权删除' });
        }
        res.json({ message: '楼层删除成功' });
    } catch (error) {
        res.status(500).json({ message: '删除失败', error: error.message });
    }
});

// 删除作品（同时删除所有相关楼层）
router.delete('/:id', auth, async (req, res) => {
    try {
        const workId = req.params.id;
        const work = await Work.findOneAndDelete({ _id: workId, author: req.userId });
        if (!work) {
            return res.status(404).json({ message: '作品不存在或无权删除' });
        }
        // 删除该作品下的所有楼层和草稿
        await Floor.deleteMany({ parentWork: workId, author: req.userId });
        res.json({ message: '作品及其所有楼层已删除' });
    } catch (error) {
        res.status(500).json({ message: '删除失败', error: error.message });
    }
});

// ... 其他路由 (如 coverImage) 保持不变 ...
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
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权修改此作品' });
        }
        work.coverImage = coverImageUrl;
        await work.save();
        res.json({ message: '封面更新成功', coverImageUrl: work.coverImage });
    } catch (error) {
        res.status(500).json({ message: '更新封面失败', error: error.message });
    }
});

module.exports = router;
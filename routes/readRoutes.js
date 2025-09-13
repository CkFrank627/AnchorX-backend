// readRoutes.js
const express = require('express');
const router = express.Router();
const Work = require('../models/Work');

// 获取单个作品的路由（分页版）
router.get('/:id', async (req, res) => {
    try {
        const work = await Work.findById(req.params.id);
        if (!work) {
            return res.status(404).json({ message: '作品不存在' });
        }

        // 保证返回数组形式的 pages
        const pages = Array.isArray(work.content) ? work.content : [{ content: {} }];

        res.json({
            _id: work._id,
            title: work.title,
            author: work.author || null,
            updatedAt: work.updatedAt,
            pages
        });
    } catch (error) {
        res.status(500).json({ message: '获取作品失败', error: error.message });
    }
});

module.exports = router;

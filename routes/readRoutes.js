// readRoutes.js
const express = require('express');
const router = express.Router();
const Work = require('../models/Work');

// 获取单个作品的路由（用于阅读页面）
// 这个路由不需要认证，因此任何人都可以访问
router.get('/:id', async (req, res) => {
    try {
        const work = await Work.findById(req.params.id);
        if (!work) {
            return res.status(404).json({ message: '作品不存在' });
        }
        res.json(work); // 返回 JSON 数据
    } catch (error) {
        res.status(500).json({ message: '获取作品失败', error: error.message });
    }
});

module.exports = router;
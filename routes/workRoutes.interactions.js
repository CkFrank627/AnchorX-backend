const express = require('express');

const Work = require('../models/Work');
const auth = require('../authMiddleware');

const router = express.Router();

router.post('/:id/like', auth, async (req, res) => {
  try {
    const workId = req.params.id;
    const userId = String(req.userId);

    const work = await Work.findById(workId).select('likedBy likesCount');
    if (!work) {
      return res.status(404).json({ message: '作品未找到' });
    }

    const hasLiked = Array.isArray(work.likedBy)
      && work.likedBy.some((id) => String(id) === userId);

    const update = hasLiked
      ? { $pull: { likedBy: req.userId }, $inc: { likesCount: -1 } }
      : { $addToSet: { likedBy: req.userId }, $inc: { likesCount: 1 } };

    const updated = await Work.findByIdAndUpdate(workId, update, {
      new: true,
      timestamps: false,
    }).select('likesCount');

    const likesCount = Math.max(updated?.likesCount || 0, 0);
    if (updated && updated.likesCount < 0) {
      await Work.findByIdAndUpdate(workId, { $set: { likesCount: 0 } }, { timestamps: false });
    }

    return res.json({
      likesCount,
      isLikedByCurrentUser: !hasLiked,
    });
  } catch (error) {
    console.error('Work like/unlike error:', error);
    return res.status(500).json({ message: '点赞操作失败', error: error.message });
  }
});

router.post('/:id/dice-log', auth, async (req, res) => {
  try {
    const workId = req.params.id;
    const { rollType, result, rollText } = req.body;

    if (!rollType || typeof result !== 'number' || !rollText) {
      return res.status(400).json({ message: '缺少骰子记录所需的参数' });
    }

    const work = await Work.findById(workId);
    if (!work) {
      return res.status(404).json({ message: '作品未找到' });
    }
    if (String(work.author) !== String(req.userId)) {
      return res.status(403).json({ message: '无权修改此作品' });
    }

    const newLog = {
      rollType,
      result,
      rollText,
      timestamp: new Date(),
    };

    work.diceLog.unshift(newLog);
    if (work.diceLog.length > 100) {
      work.diceLog = work.diceLog.slice(0, 100);
    }

    await work.save();

    return res.status(201).json({ message: '骰子记录成功', logEntry: newLog });
  } catch (error) {
    console.error('Dice log error:', error);
    return res.status(500).json({ message: '记录骰子失败', error: error.message });
  }
});

router.get('/:id/dice-log', auth, async (req, res) => {
  try {
    const work = await Work.findById(req.params.id).select('diceLog author');
    if (!work) {
      return res.status(404).json({ message: '作品未找到' });
    }
    if (String(work.author) !== String(req.userId)) {
      return res.status(403).json({ message: '无权查看此作品的骰子记录' });
    }

    return res.json(work.diceLog);
  } catch (error) {
    return res.status(500).json({ message: '获取骰子记录失败', error: error.message });
  }
});

module.exports = router;

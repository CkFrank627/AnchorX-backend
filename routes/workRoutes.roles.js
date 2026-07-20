const express = require('express');

const Work = require('../models/Work');
const auth = require('../authMiddleware');

const router = express.Router();

router.get('/:id/roles', auth, async (req, res) => {
  try {
    const work = await Work.findById(req.params.id);
    if (!work) {
      return res.status(404).json({ message: '作品未找到' });
    }
    if (String(work.author) !== String(req.userId)) {
      return res.status(403).json({ message: '无权查看此作品的角色' });
    }

    return res.json(work.roles);
  } catch (error) {
    return res.status(500).json({ message: '获取角色失败', error: error.message });
  }
});

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
    if (String(work.author) !== String(req.userId)) {
      return res.status(403).json({ message: '无权修改此作品' });
    }

    work.roles.push({ name, notes, color });
    await work.save();

    return res.status(201).json(work.roles[work.roles.length - 1]);
  } catch (error) {
    return res.status(500).json({ message: '添加角色失败', error: error.message });
  }
});

router.put('/:workId/roles/:roleId', auth, async (req, res) => {
  try {
    const { workId, roleId } = req.params;
    const { name, notes, color, gallery } = req.body;

    const work = await Work.findById(workId);
    if (!work) {
      return res.status(404).json({ message: '作品未找到' });
    }
    if (String(work.author) !== String(req.userId)) {
      return res.status(403).json({ message: '无权修改此作品' });
    }

    const roleToUpdate = work.roles.id(roleId);
    if (!roleToUpdate) {
      return res.status(404).json({ message: '角色未找到' });
    }

    roleToUpdate.name = name ?? roleToUpdate.name;
    roleToUpdate.notes = notes ?? roleToUpdate.notes;
    roleToUpdate.color = color ?? roleToUpdate.color;
    if (gallery !== undefined) {
      roleToUpdate.gallery = gallery;
    }

    await work.save();
    return res.json(roleToUpdate);
  } catch (error) {
    return res.status(500).json({ message: '更新角色失败', error: error.message });
  }
});

router.delete('/:workId/roles/:roleId', auth, async (req, res) => {
  try {
    const { workId, roleId } = req.params;

    const work = await Work.findById(workId);
    if (!work) {
      return res.status(404).json({ message: '作品未找到' });
    }
    if (String(work.author) !== String(req.userId)) {
      return res.status(403).json({ message: '无权修改此作品' });
    }

    work.roles.pull({ _id: roleId });
    await work.save();

    return res.json({ message: '角色删除成功' });
  } catch (error) {
    return res.status(500).json({ message: '删除角色失败', error: error.message });
  }
});

module.exports = router;

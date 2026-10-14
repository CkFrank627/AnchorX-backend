const express = require('express');

const Work = require('../models/Work');
const auth = require('../authMiddleware');
const {
  expandTagNormVariants,
  normalizeTagsInput,
  requireAdmin,
} = require('./workRouteUtils');

const router = express.Router();

router.patch('/:id/tags', auth, async (req, res) => {
  try {
    const { id } = req.params;
    let tags = req.body.tags;

    if (typeof tags === 'string') {
      try {
        tags = JSON.parse(tags);
      } catch (error) {
        // Keep the original value for the array check below.
      }
    }

    if (!Array.isArray(tags)) {
      return res.status(400).json({ message: 'tags 必须是数组' });
    }

    const work = await Work.findOne({ _id: id, author: req.userId });
    if (!work) {
      return res.status(404).json({ message: '作品不存在或无权修改' });
    }

    const normalized = normalizeTagsInput(tags);
    work.tags = normalized.tags;
    work.tagsNorm = normalized.tagsNorm;
    work.updatedAt = new Date();

    await work.save();

    return res.json({ ok: true, tags: work.tags });
  } catch (error) {
    return res.status(500).json({ message: '更新标签失败', error: error.message });
  }
});

router.patch('/:id/tags-admin', auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let tags = req.body.tags;

    if (typeof tags === 'string') {
      try {
        tags = JSON.parse(tags);
      } catch (error) {
        // Keep the original value for the array check below.
      }
    }

    if (!Array.isArray(tags)) {
      return res.status(400).json({ message: 'tags 必须是数组' });
    }

    const normalized = normalizeTagsInput(tags);
    const touch = (req.query.touch === '1') || (req.body.touch === true);
    const update = {
      $set: {
        tags: normalized.tags,
        tagsNorm: normalized.tagsNorm,
      },
    };

    if (touch) {
      update.$currentDate = { updatedAt: true };
    }

    const work = await Work.findByIdAndUpdate(id, update, {
      new: true,
      timestamps: false,
    });

    if (!work) {
      return res.status(404).json({ message: '作品不存在' });
    }

    return res.json({ ok: true, tags: work.tags });
  } catch (error) {
    return res.status(500).json({ message: '管理员更新标签失败', error: error.message });
  }
});

router.post('/admin/normalize-tags', auth, requireAdmin, async (req, res) => {
  try {
    const onlyPublished = String(req.query.published || '1') === '1';
    const touch = String(req.query.touch || '0') === '1';
    const dry = String(req.query.dry || '0') === '1';

    const filter = onlyPublished ? { isPublished: true } : {};
    const cursor = Work.find(filter).select('_id tags tagsNorm').cursor();

    let scanned = 0;
    let changed = 0;

    for await (const work of cursor) {
      scanned += 1;

      const normalized = normalizeTagsInput(Array.isArray(work.tags) ? work.tags : []);
      const sameTags = JSON.stringify(normalized.tags) === JSON.stringify(work.tags || []);
      const sameNorm = JSON.stringify(normalized.tagsNorm) === JSON.stringify(work.tagsNorm || []);

      if (sameTags && sameNorm) continue;

      changed += 1;
      if (dry) continue;

      const update = { $set: { tags: normalized.tags, tagsNorm: normalized.tagsNorm } };
      if (touch) {
        update.$currentDate = { updatedAt: true };
      }

      await Work.updateOne({ _id: work._id }, update, { timestamps: false });
    }

    return res.json({ ok: true, scanned, changed, dry, onlyPublished, touch });
  } catch (error) {
    return res.status(500).json({ message: 'normalize-tags 失败', error: error.message });
  }
});

router.post('/admin/bulk-tags', auth, requireAdmin, async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const touch = req.body.touch === true;

    if (!items.length) {
      return res.status(400).json({ message: 'items 不能为空' });
    }

    if (items.length > 500) {
      return res.status(400).json({ message: '一次最多 500 条，避免把库打爆' });
    }

    const ops = [];
    const skipped = [];

    for (const item of items) {
      const id = item && item.id;
      let tags = item && item.tags;

      if (!id) {
        skipped.push({ id, reason: 'missing id' });
        continue;
      }

      if (typeof tags === 'string') {
        try {
          tags = JSON.parse(tags);
        } catch (error) {
          // Keep the original value for the array check below.
        }
      }

      if (!Array.isArray(tags)) {
        skipped.push({ id, reason: 'tags not array' });
        continue;
      }

      const normalized = normalizeTagsInput(tags);
      const update = { $set: { tags: normalized.tags, tagsNorm: normalized.tagsNorm } };

      if (touch) {
        update.$currentDate = { updatedAt: true };
      }

      ops.push({
        updateOne: {
          filter: { _id: id },
          update,
        },
      });
    }

    if (!ops.length) {
      return res.status(400).json({ message: '没有可执行的更新项', skipped });
    }

    const result = await Work.bulkWrite(ops, { ordered: false });
    return res.json({ ok: true, bulk: result, skipped });
  } catch (error) {
    return res.status(500).json({ message: '批量补标签失败', error: error.message });
  }
});

router.get('/public-tags', async (req, res) => {
  try {
    const rows = await Work.aggregate([
      { $match: { isPublished: true } },
      {
        $project: {
          zipped: {
            $zip: {
              inputs: [
                { $ifNull: ['$tagsNorm', []] },
                { $ifNull: ['$tags', []] },
              ],
            },
          },
        },
      },
      { $unwind: '$zipped' },
      {
        $project: {
          tagNorm: { $arrayElemAt: ['$zipped', 0] },
          tag: { $arrayElemAt: ['$zipped', 1] },
        },
      },
      { $match: { tagNorm: { $ne: null }, tag: { $ne: null } } },
      { $group: { _id: '$tagNorm', tag: { $first: '$tag' }, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]);

    const tags = rows.map((row) => ({
      tag: row.tag,
      tagNorm: row._id,
      count: row.count,
    }));

    return res.json({ ok: true, tags });
  } catch (error) {
    return res.status(500).json({ message: '获取标签统计失败', error: error.message });
  }
});

router.get('/public-stats', async (req, res) => {
  try {
    const rows = await Work.aggregate([
      { $match: { isPublished: true } },
      {
        $group: {
          _id: null,
          works: { $sum: 1 },
          authors: { $addToSet: '$author' },
          views: { $sum: { $ifNull: ['$views', 0] } },
          likes: { $sum: { $ifNull: ['$likesCount', 0] } },
          words: { $sum: { $ifNull: ['$wordCount', 0] } },
        },
      },
    ]);

    const stats = rows[0] || { works: 0, authors: [], views: 0, likes: 0, words: 0 };
    return res.json({
      ok: true,
      works: stats.works,
      authors: stats.authors.length,
      views: stats.views,
      likes: stats.likes,
      words: stats.words,
    });
  } catch (error) {
    return res.status(500).json({ message: '获取公开统计失败', error: error.message });
  }
});

router.get('/public', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 50);
    const skip = (page - 1) * limit;
    const match = String(req.query.match || 'any').toLowerCase() === 'all' ? 'all' : 'any';
    const queryText = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const sortName = String(req.query.sort || 'updated').toLowerCase();

    let rawInclude = req.query.tag || req.query.tags;
    let rawExclude = req.query.notTag || req.query.notTags;

    let includeList = [];
    if (Array.isArray(rawInclude)) includeList = rawInclude;
    else if (typeof rawInclude === 'string' && rawInclude.trim()) includeList = rawInclude.split(',');
    includeList = includeList.map((value) => String(value).trim()).filter(Boolean);

    let excludeList = [];
    if (Array.isArray(rawExclude)) excludeList = rawExclude;
    else if (typeof rawExclude === 'string' && rawExclude.trim()) excludeList = rawExclude.split(',');
    excludeList = excludeList.map((value) => String(value).trim()).filter(Boolean);

    const and = [{ isPublished: true }];
    const includeSets = [];

    for (const value of includeList) {
      const variants = expandTagNormVariants(value);
      if (variants.length) includeSets.push(variants);
    }

    const exclude = Array.from(new Set(
      excludeList.flatMap((value) => expandTagNormVariants(value))
    ));

    if (includeSets.length) {
      if (match === 'all') {
        for (const variants of includeSets) {
          and.push({ tagsNorm: { $in: variants } });
        }
      } else {
        and.push({
          tagsNorm: {
            $in: Array.from(new Set(includeSets.flat())),
          },
        });
      }
    }

    if (exclude.length) {
      and.push({ tagsNorm: { $nin: exclude } });
    }

    if (queryText) {
      const escapedQuery = queryText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      and.push({ title: { $regex: escapedQuery, $options: 'i' } });
    }

    const filter = and.length === 1 ? and[0] : { $and: and };
    const sortOptions = {
      updated: { updatedAt: -1, _id: -1 },
      views: { views: -1, updatedAt: -1, _id: -1 },
      likes: { likesCount: -1, updatedAt: -1, _id: -1 },
      newest: { createdAt: -1, _id: -1 },
    };
    const sort = sortOptions[sortName] || sortOptions.updated;

    const [works, total] = await Promise.all([
      Work.find(filter)
        .select('-content -pages -likedBy -diceLog -effectsDraft -effectsPublished -backgroundDraft -backgroundPublished')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('author', 'username'),
      Work.countDocuments(filter),
    ]);

    return res.json({
      works,
      page,
      limit,
      total,
      hasMore: skip + works.length < total,
    });
  } catch (error) {
    return res.status(500).json({ message: '获取作品失败', error: error.message });
  }
});

module.exports = router;

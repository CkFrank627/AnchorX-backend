//workRoutes.js

const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const Work = require('../models/Work');
const WorkPage = require('../models/WorkPage');
const auth = require('../authMiddleware');
const { decodeRequestUser } = require('../services/authService');
const { loadWorkForRead } = require('../services/readWorkService');
const {
  extractEffectiveLines,
  remapWorkEffectBindings,
} = require('../services/effectBindingService');
const workTagsRoutes = require('./workRoutes.tags');
const workRolesRoutes = require('./workRoutes.roles');
const workInteractionsRoutes = require('./workRoutes.interactions');
const {
  buildOptionalAuth,
  calcPageWordCount,
  calculateWordCount,
  getEmbeddedPagesRange,
  getSeparatedPages,
  getSeparatedPagesRange,
  getWorkPageCount,
  rewriteUploadsInDelta,
} = require('./workRouteUtils');

const router = express.Router();
const optionalAuth = buildOptionalAuth(decodeRequestUser);

const uploadDir = path.join('public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

function isWorkReadableByUser(work, userId) {
  return Boolean(work) && (work.isPublished === true || String(work.author) === String(userId || ''));
}

router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '没有上传文件' });
    }

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    return res.status(200).json({ message: '上传成功', imageUrl });
  } catch (error) {
    return res.status(500).json({ message: '上传失败', error: error.message });
  }
});

router.use(workTagsRoutes);
router.use(workRolesRoutes);
router.use(workInteractionsRoutes);

router.patch('/:id/cover', auth, async (req, res) => {
  try {
    const { coverImageUrl } = req.body;
    if (!coverImageUrl) {
      return res.status(400).json({ message: '缺少封面图片URL' });
    }

    const work = await Work.findById(req.params.id);
    if (!work) {
      return res.status(404).json({ message: '作品未找到' });
    }
    if (String(work.author) !== String(req.userId)) {
      return res.status(403).json({ message: '无权修改此作品' });
    }

    work.coverImage = coverImageUrl;
    await work.save();

    return res.json({ message: '封面更新成功', coverImageUrl: work.coverImage });
  } catch (error) {
    return res.status(500).json({ message: '更新封面失败', error: error.message });
  }
});

router.patch('/:id/publish', auth, async (req, res) => {
  try {
    if (req.body.pages !== undefined || req.body.content !== undefined) {
      return res.status(400).json({
        message: '不再支持 PATCH 整包 pages/content。请改用 /api/works/:id/pages/* 接口保存页面内容。',
      });
    }

    const { isPublished } = req.body;
    if (typeof isPublished !== 'boolean') {
      return res.status(400).json({ message: 'isPublished 字段必须为布尔值' });
    }

    const work = await Work.findById(req.params.id);
    if (!work) {
      return res.status(404).json({ message: '作品未找到' });
    }
    if (String(work.author) !== String(req.userId)) {
      return res.status(403).json({ message: '无权修改此作品的发布状态' });
    }

    work.isPublished = isPublished;
    await work.save();

    return res.json({
      message: isPublished ? '作品已成功发布' : '作品已成功下架',
      isPublished: work.isPublished,
    });
  } catch (error) {
    return res.status(500).json({ message: '更新发布状态失败', error: error.message });
  }
});

router.get('/:id/meta', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const noView = req.query.noView === '1';

    const accessWork = await Work.findById(id).select('author isPublished');
    if (!accessWork || !isWorkReadableByUser(accessWork, req.userId)) {
      return res.status(404).json({ message: '作品不存在或无权查看' });
    }

    const work = noView
      ? await Work.findById(id).populate('author', 'username')
      : await Work.findByIdAndUpdate(
        id,
        { $inc: { views: 1 } },
        { new: true, timestamps: false }
      ).populate('author', 'username');

    if (!work) {
      return res.status(404).json({ message: '作品不存在' });
    }

    const pageCount = await getWorkPageCount(work);
    const workObject = work.toObject();
    delete workObject.pages;
    delete workObject.content;

    return res.json({
      ...workObject,
      pageCount,
      pageStorage: work.pageStorage || 'embedded',
    });
  } catch (error) {
    return res.status(500).json({ message: '获取作品元信息失败', error: error.message });
  }
});

router.get('/:id/page-batch', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    let limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 50);
    const weak = (req.query.weak === '1') || (req.query.mode === 'weak');
    if (weak) {
      limit = 2;
    }

    const work = await Work.findById(id).populate('author', 'username');
    if (!work || !isWorkReadableByUser(work, req.userId)) {
      return res.status(404).json({ message: '作品不存在或无权查看' });
    }

    const pageCount = await getWorkPageCount(work);
    if (offset >= pageCount) {
      return res.json({ workId: id, offset, limit, pageCount, hasMore: false, pages: [] });
    }

    const pages = work.pageStorage === 'separate'
      ? await getSeparatedPagesRange(work._id, offset, limit)
      : getEmbeddedPagesRange(work, offset, limit);

    return res.json({
      workId: work._id,
      pageStorage: work.pageStorage || 'embedded',
      offset,
      limit,
      pageCount,
      hasMore: offset + pages.length < pageCount,
      pages,
    });
  } catch (error) {
    return res.status(500).json({ message: '获取作品分页内容失败', error: error.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const works = await Work.find({ author: req.userId }).populate('author', 'username');
    return res.json(works);
  } catch (error) {
    return res.status(500).json({ message: '获取作品失败', error: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { title, content } = req.body;
    const pageArray = Array.isArray(content) && content.length > 0
      ? content
      : [{ content: { ops: [] } }];

    const normalizedPages = pageArray.map((page) => ({
      content: page && typeof page.content === 'object' ? page.content : { ops: [] },
    }));

    const newWork = new Work({
      title,
      author: req.userId,
      pageStorage: 'separate',
      pageCount: normalizedPages.length,
      wordCount: calculateWordCount(normalizedPages),
      updatedAt: new Date(),
      content: [{ content: { ops: [] } }],
    });

    await newWork.save();

    const operations = normalizedPages.map((page, index) => ({
      updateOne: {
        filter: { workId: newWork._id, index },
        update: {
          $set: {
            workId: newWork._id,
            index,
            content: page.content,
            wordCount: calcPageWordCount(page.content),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    if (operations.length) {
      await WorkPage.bulkWrite(operations, { ordered: false });
    }

    return res.status(201).json(newWork);
  } catch (error) {
    return res.status(400).json({ message: '创建作品失败', error: error.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    if (req.body.pages !== undefined || req.body.content !== undefined) {
      return res.status(400).json({
        message: '不再支持 PUT 整包 pages/content。请改用 /api/works/:id/pages/* 接口保存页面内容。若出现此信息请立刻联系站长',
      });
    }

    const { title, coverImage, isPublished } = req.body;
    const updateDoc = { updatedAt: new Date() };
    if (title !== undefined) updateDoc.title = title;
    if (coverImage !== undefined) updateDoc.coverImage = coverImage;
    if (isPublished !== undefined) updateDoc.isPublished = isPublished;

    const updatedWork = await Work.findOneAndUpdate(
      { _id: req.params.id, author: req.userId },
      { $set: updateDoc },
      { new: true, timestamps: true }
    );

    if (!updatedWork) {
      return res.status(404).json({ message: '作品不存在或无权修改' });
    }

    return res.json(updatedWork);
  } catch (error) {
    return res.status(500).json({ message: '更新作品失败', error: error.message });
  }
});

router.get('/:id/pages', optionalAuth, async (req, res) => {
  try {
    const workId = req.params.id;
    const hasStart = req.query.start !== undefined;
    const hasLimit = req.query.limit !== undefined;
    const isBatchMode = hasStart || hasLimit;

    const startRaw = parseInt(req.query.start, 10);
    const limitRaw = parseInt(req.query.limit, 10);
    const weak = String(req.query.weak || '') === '1';

    let start = Number.isFinite(startRaw) ? Math.max(startRaw, 0) : 0;
    let limit = Number.isFinite(limitRaw) ? limitRaw : 5;

    if (weak) {
      if (!Number.isFinite(limit) || limit < 2) limit = 2;
      if (limit > 2) limit = 2;
    } else {
      if (!Number.isFinite(limit) || limit <= 0) limit = 5;
      limit = Math.min(limit, 10);
    }

    const work = await Work.findById(workId).lean();
    if (!work) {
      return res.status(404).json({ message: '作品不存在' });
    }

    const isOwner = req.userId && String(work.author) === String(req.userId);
    const canRead = isOwner || work.isPublished === true;

    if (isBatchMode) {
      if (!canRead) {
        return res.status(404).json({ message: '作品不存在或无权查看' });
      }

      if (work.pageStorage === 'separate') {
        let pageCount = Number.isFinite(work.pageCount) ? work.pageCount : 0;
        if (!pageCount) {
          pageCount = await WorkPage.countDocuments({ workId: work._id });
        }

        const docs = await WorkPage.find({
          workId: work._id,
          index: { $gte: start, $lt: start + limit },
        }).sort({ index: 1 }).lean();

        const pages = docs.map((page) => ({
          index: page.index,
          content: rewriteUploadsInDelta(page.content || { ops: [] }),
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        }));

        return res.json({
          pageCount,
          start,
          limit,
          hasMore: start + pages.length < pageCount,
          pages,
        });
      }

      const embedded = Array.isArray(work.content) ? work.content : [];
      const pages = embedded.slice(start, start + limit).map((page, index) => ({
        index: start + index,
        ...page,
        content: rewriteUploadsInDelta(page?.content || { ops: [] }),
      }));

      return res.json({
        pageCount: embedded.length,
        start,
        limit,
        hasMore: start + pages.length < embedded.length,
        pages,
      });
    }

    if (!req.userId) {
      return res.status(401).json({ message: '请先登录' });
    }
    if (!isOwner) {
      return res.status(403).json({ message: '无权查看此作品页面' });
    }

    if (work.pageStorage !== 'separate') {
      const pages = (work.content || []).map((page) => ({
        ...page,
        content: rewriteUploadsInDelta(page?.content || { ops: [] }),
      }));
      return res.json({ pages });
    }

    const pages = await getSeparatedPages(work._id);
    return res.json({
      pages: pages.map((page) => ({
        ...page,
        content: rewriteUploadsInDelta(page.content || { ops: [] }),
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: '获取 pages 失败', error: error.message });
  }
});

router.patch('/:id/pages/:pageIndex', auth, async (req, res) => {
  try {
    const pageIndex = Number(req.params.pageIndex);
    const { content, title } = req.body;

    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      return res.status(400).json({ message: 'pageIndex 不合法' });
    }
    if (!content || typeof content !== 'object') {
      return res.status(400).json({ message: 'content 不合法' });
    }

    const work = await Work.findOne({ _id: req.params.id, author: req.userId });
    if (!work) {
      return res.status(404).json({ message: '作品不存在或无权修改' });
    }
    if (work.pageStorage !== 'separate') {
      return res.status(400).json({ message: '该作品不是 separate 存储（暂不支持单页保存）' });
    }

    const page = await WorkPage.findOne({ workId: work._id, index: pageIndex });
    if (!page) {
      return res.status(404).json({ message: '页面不存在' });
    }

    const oldWordCount = page.wordCount || 0;
    const newWordCount = calcPageWordCount(content);
    const diff = newWordCount - oldWordCount;
    const previousPages = await WorkPage.find({
      workId: work._id,
      index: { $lt: pageIndex },
    }).select('content').lean();
    const pageStartIndex = previousPages.reduce(
      (sum, previousPage) => sum + extractEffectiveLines(previousPage.content).length,
      0
    );
    const oldLines = extractEffectiveLines(page.content);
    const newLines = extractEffectiveLines(content);

    remapWorkEffectBindings(work, { oldLines, newLines, pageStartIndex });

    page.content = content;
    page.wordCount = newWordCount;
    page.updatedAt = new Date();
    await page.save();

    work.wordCount = Math.max((work.wordCount || 0) + diff, 0);
    work.updatedAt = new Date();
    if (title !== undefined) work.title = title;
    await work.save();

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: '更新单页失败', error: error.message });
  }
});

router.post('/:id/pages', auth, async (req, res) => {
  try {
    const work = await Work.findOne({ _id: req.params.id, author: req.userId });
    if (!work) {
      return res.status(404).json({ message: '作品不存在或无权修改' });
    }
    if (work.pageStorage !== 'separate') {
      return res.status(400).json({ message: '该作品不是 separate 存储（暂不支持新增页）' });
    }

    const newIndex = Number(work.pageCount || 0);

    await WorkPage.create({
      workId: work._id,
      index: newIndex,
      content: { ops: [] },
      wordCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    work.pageCount = newIndex + 1;
    work.updatedAt = new Date();
    await work.save();

    return res.status(201).json({ index: newIndex });
  } catch (error) {
    return res.status(500).json({ message: '新增页面失败', error: error.message });
  }
});

router.delete('/:id/pages/:pageIndex', auth, async (req, res) => {
  try {
    const pageIndex = Number(req.params.pageIndex);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      return res.status(400).json({ message: 'pageIndex 不合法' });
    }

    const work = await Work.findOne({ _id: req.params.id, author: req.userId });
    if (!work) {
      return res.status(404).json({ message: '作品不存在或无权修改' });
    }
    if (work.pageStorage !== 'separate') {
      return res.status(400).json({ message: '该作品不是 separate 存储（暂不支持删页）' });
    }
    if ((work.pageCount || 0) <= 1) {
      return res.status(400).json({ message: '至少保留一页' });
    }

    const previousPages = await WorkPage.find({
      workId: work._id,
      index: { $lt: pageIndex },
    }).select('content').lean();
    const pageStartIndex = previousPages.reduce(
      (sum, previousPage) => sum + extractEffectiveLines(previousPage.content).length,
      0
    );

    const deleted = await WorkPage.findOneAndDelete({ workId: work._id, index: pageIndex });
    if (!deleted) {
      return res.status(404).json({ message: '页面不存在' });
    }

    await WorkPage.updateMany(
      { workId: work._id, index: { $gt: pageIndex } },
      { $inc: { index: -1 } }
    );

    remapWorkEffectBindings(work, {
      oldLines: extractEffectiveLines(deleted.content),
      newLines: [],
      pageStartIndex,
    });

    work.pageCount = Math.max((work.pageCount || 1) - 1, 1);
    work.wordCount = Math.max((work.wordCount || 0) - (deleted.wordCount || 0), 0);
    work.updatedAt = new Date();
    await work.save();

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: '删除页面失败', error: error.message });
  }
});

router.patch('/:id', auth, async (req, res) => {
  try {
    if (req.body.pages !== undefined || req.body.content !== undefined) {
      return res.status(400).json({
        message: '不再支持 PATCH 整包 pages/content。请改用 /api/works/:id/pages/* 接口保存页面内容。',
      });
    }

    for (const key of ['effectsDraft', 'effectsPublished', 'backgroundDraft', 'backgroundPublished']) {
      if (typeof req.body[key] === 'string') {
        try {
          req.body[key] = JSON.parse(req.body[key]);
        } catch (error) {
          console.warn(`PATCH /:id 解析 ${key} JSON 失败:`, error.message);
        }
      }
    }

    const {
      title,
      backgroundDraft,
      backgroundPublished,
      ...otherFields
    } = req.body;

    const updateFields = { ...otherFields };
    if (title !== undefined) {
      updateFields.title = title;
    }

    if (backgroundDraft && typeof backgroundDraft === 'object') {
      updateFields.backgroundDraft = {
        images: Array.isArray(backgroundDraft.images) ? backgroundDraft.images : [],
        bindings: Array.isArray(backgroundDraft.bindings) ? backgroundDraft.bindings : [],
        transitions: Array.isArray(backgroundDraft.transitions) ? backgroundDraft.transitions : [],
      };
    }

    if (backgroundPublished && typeof backgroundPublished === 'object') {
      updateFields.backgroundPublished = {
        images: Array.isArray(backgroundPublished.images) ? backgroundPublished.images : [],
        bindings: Array.isArray(backgroundPublished.bindings) ? backgroundPublished.bindings : [],
        transitions: Array.isArray(backgroundPublished.transitions) ? backgroundPublished.transitions : [],
      };
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(200).json({ message: '没有需要更新的字段' });
    }

    const updatedWork = await Work.findOneAndUpdate(
      { _id: req.params.id, author: req.userId },
      { $set: updateFields },
      { new: true, timestamps: true }
    );

    if (!updatedWork) {
      return res.status(404).json({ message: '作品不存在或无权修改' });
    }

    return res.json(updatedWork);
  } catch (error) {
    console.error('PATCH /:id 更新作品失败:', error);
    return res.status(500).json({ message: '更新作品失败', error: error.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const work = await Work.findOneAndDelete({ _id: req.params.id, author: req.userId });
    if (!work) {
      return res.status(404).json({ message: '作品不存在或无权删除' });
    }

    await WorkPage.deleteMany({ workId: work._id });
    return res.json({ message: '作品删除成功' });
  } catch (error) {
    return res.status(500).json({ message: '删除失败', error: error.message });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  const handlerStart = Date.now();
  console.log(`[WORK GET] start, id = ${req.params.id}`);

  try {
    const accessWork = await Work.findById(req.params.id).select('author isPublished');
    if (!accessWork || !isWorkReadableByUser(accessWork, req.userId)) {
      return res.status(404).json({ message: '作品不存在或无权查看' });
    }

    const responseWork = await loadWorkForRead(req.params.id, {
      viewerUserId: req.userId,
      incrementViews: true,
    });

    if (!responseWork) {
      return res.status(404).json({ message: '作品不存在' });
    }

    console.log(`[WORK GET] id=${req.params.id} handler total: ${Date.now() - handlerStart} ms`);
    return res.json(responseWork);
  } catch (error) {
    console.error('获取作品失败:', error);
    return res.status(500).json({ message: '获取作品失败', error: error.message });
  }
});

module.exports = router;

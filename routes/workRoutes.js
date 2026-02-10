//workRoutes.js

const express = require('express');
const router = express.Router();
const Work = require('../models/Work');
const jwt = require('jsonwebtoken');
const WorkPage = require('../models/WorkPage');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 定义文件存储的目标文件夹
const uploadDir = 'public/uploads';
// 确保目录存在
fs.mkdirSync(uploadDir, { recursive: true });

// 配置存储引擎
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // 文件将存储在 'public/uploads' 目录
  },
  filename: function (req, file, cb) {
    // 创建一个唯一的文件名，防止重名覆盖
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// --- 新增：创建文件上传接口 ---
// 客户端会将图片 POST 到这个路由
router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '没有上传文件' });
    }
    // 构建图片的公开访问 URL
    // 注意：这里的 URL 结构需要和你配置静态文件服务的方式匹配
    const imageUrl = `https://${req.get('host')}/uploads/${req.file.filename}`; 
    // 将 URL 返回给前端
    res.status(200).json({ message: '上传成功', imageUrl: imageUrl });
  } catch (error) {
    res.status(500).json({ message: '上传失败', error: error.message });
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

// **新增：可选认证中间件**
// 如果有 token，解析并设置 req.userId，没有则继续
const optionalAuth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
        try {
            const decoded = jwt.verify(token, 'YOUR_SECRET_KEY');
            req.userId = decoded.userId;
        } catch (error) {
            // 令牌无效，但我们不中断请求，只把 userId 设为 null
            req.userId = null; 
        }
    } else {
        req.userId = null;
    }
    next();
};

// **新增：计算字数的辅助函数**
const calculateWordCount = (pages) => {
    if (!Array.isArray(pages) || pages.length === 0) {
        return 0;
    }

    return pages.reduce((sum, p) => {
        if (!p.content) return sum;
        if (typeof p.content === 'object' && Array.isArray(p.content.ops)) {
            // 如果是 Delta 格式，提取文本并计算长度
            const text = p.content.ops.map(op => op.insert || '').join('');
            // 排除图片和换行符等非文字内容
            const cleanText = text.replace(/[\n\r\t\s\u200B-\u200D\uFEFF]/g, '');
            return sum + cleanText.length;
        }
        return sum;
    }, 0);
};

const calcPageWordCount = (content) => {
  if (!content || typeof content !== 'object' || !Array.isArray(content.ops)) return 0;
  const text = content.ops.map(op => (typeof op.insert === 'string' ? op.insert : '')).join('');
  return text.replace(/[\n\r\t\s\u200B-\u200D\uFEFF]/g, '').length;
};

const normalizePageForResponse = (pageObj) => ({
  content: pageObj.content || { ops: [] },
  createdAt: pageObj.createdAt || new Date(),
  updatedAt: pageObj.updatedAt || new Date(),
});

const rewriteUploadsInDelta = (deltaObj) => {
  if (!deltaObj || typeof deltaObj !== 'object') return deltaObj;
  try {
    let s = JSON.stringify(deltaObj);
    s = s.replace(/http:\/\/api\.anchorx\.ca\/uploads/g, 'https://api.anchorx.ca/uploads');
    return JSON.parse(s);
  } catch (e) {
    return deltaObj;
  }
};


// 懒迁移：把 work.content 拆到 WorkPage
const ensureSeparated = async (work) => {
  if (!work || work.pageStorage === 'separate') return;

  const embeddedPages = Array.isArray(work.content) && work.content.length > 0
    ? work.content
    : [{ content: { ops: [] } }];

  // bulk upsert
  const ops = embeddedPages.map((p, i) => {
    const content = p?.content || { ops: [] };
    return {
      updateOne: {
        filter: { workId: work._id, index: i },
        update: {
          $set: {
            workId: work._id,
            index: i,
            content,
            wordCount: calcPageWordCount(content),
            createdAt: p.createdAt || new Date(),
            updatedAt: new Date(),
          }
        },
        upsert: true
      }
    };
  });

  if (ops.length) await WorkPage.bulkWrite(ops, { ordered: false });

  const totalWC = embeddedPages.reduce((sum, p) => sum + calcPageWordCount(p?.content), 0);

  // 迁移后把 Work 主文档变轻（避免以后接近 Mongo 16MB 上限）
  work.pageStorage = 'separate';
  work.pageCount = embeddedPages.length;
  work.pagesMigratedAt = new Date();
  work.wordCount = totalWC;

  // 可选：把 content 清成占位（强烈建议）
  work.content = [{ content: { ops: [] } }];

  await work.save();
};

const getSeparatedPages = async (workId) => {
  const pageDocs = await WorkPage.find({ workId }).sort({ index: 1 }).lean();
  return pageDocs.map(p => normalizePageForResponse(p));
};

// ✅ 新增：按范围获取 separate pages（用于阅读端懒加载）
const getSeparatedPagesRange = async (workId, offset = 0, limit = 5) => {
  const o = Math.max(parseInt(offset, 10) || 0, 0);
  const l = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 50);

  const pageDocs = await WorkPage.find({
    workId,
    index: { $gte: o, $lt: o + l }
  }).sort({ index: 1 }).lean();

  return pageDocs.map(p => ({
    ...normalizePageForResponse(p),
    index: p.index,
    content: rewriteUploadsInDelta(p.content || { ops: [] }),
  }));
};

// ✅ 新增：计算 pageCount（separate 优先用 work.pageCount，否则 count WorkPage）
const getWorkPageCount = async (work) => {
  if (!work) return 1;
  if (work.pageStorage === 'separate') {
    if (typeof work.pageCount === 'number' && work.pageCount > 0) return work.pageCount;
    return await WorkPage.countDocuments({ workId: work._id });
  }
  if (Array.isArray(work.content) && work.content.length > 0) return work.content.length;
  return 1;
};

// ✅ 新增：embedded（非 separate）按范围切片
const getEmbeddedPagesRange = (work, offset = 0, limit = 5) => {
  const pages = (Array.isArray(work.content) && work.content.length > 0)
    ? work.content
    : [{ content: { ops: [] } }];

  const o = Math.max(parseInt(offset, 10) || 0, 0);
  const l = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 50);

  return pages.slice(o, o + l).map((p, i) => ({
    ...normalizePageForResponse(p),
    index: o + i,
    content: rewriteUploadsInDelta(p?.content || { ops: [] }),
  }));
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


const normalizeTagsInput = (input) => {
  const arr = Array.isArray(input) ? input : [];
  const out = [];
  const outNorm = [];
  const seen = new Set();

  for (let raw of arr) {
    if (raw === null || raw === undefined) continue;
    let t = String(raw).replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (t.length === 0) continue;
    if (t.length > 32) t = t.slice(0, 32);

    const n = t.toLowerCase();
    if (seen.has(n)) continue;

    seen.add(n);
    out.push(t);
    outNorm.push(n);
    if (out.length >= 30) break;
  }

  return { tags: out, tagsNorm: outNorm };
};


// ------------------------------------------------------------------

// ------------------------------------------------------------------
// **新增：切换作品发布状态的路由 (PATCH /:id/publish)**
// ------------------------------------------------------------------
router.patch('/:id/publish', auth, async (req, res) => {
    try {
        const workId = req.params.id;
        const { isPublished } = req.body; // 期望接收 true 或 false

        // 🚫 禁止整包 pages/content（避免 413）
// 页面内容请用 /:id/pages/:pageIndex
if (req.body.pages !== undefined || req.body.content !== undefined) {
  return res.status(400).json({
    message: '不再支持 PATCH 整包 pages/content。请改用 /api/works/:id/pages/* 接口保存页面内容。'
  });
}

        // 验证 isPublished 字段
        if (typeof isPublished !== 'boolean') {
            return res.status(400).json({ message: 'isPublished 字段必须为布尔值' });
        }

        const work = await Work.findById(workId);
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }

        // 验证用户权限
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权修改此作品的发布状态' });
        }

        // 更新发布状态
        work.isPublished = isPublished;
        await work.save();

        const message = isPublished ? '作品已成功发布' : '作品已成功下架';
        res.json({ message, isPublished: work.isPublished });

    } catch (error) {
        res.status(500).json({ message: '更新发布状态失败', error: error.message });
    }
});
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// ✅ 新增：分页获取“已发布作品”（用于阅读列表）
// GET /api/works/public?page=1&limit=5
// ------------------------------------------------------------------
// GET /api/works/public?page=1&limit=9&tag=题材:悬疑
// GET /api/works/public?page=1&limit=9&tags=题材:悬疑,世界观:幻想乡
router.get('/public', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 50);
    const skip = (page - 1) * limit;

    const filter = { isPublished: true };

    // ✅ tag/tags 过滤（用 tagsNorm 做不区分大小写）
    let rawTags = req.query.tag || req.query.tags;
    let list = [];
    if (Array.isArray(rawTags)) list = rawTags;
    else if (typeof rawTags === 'string' && rawTags.trim()) list = rawTags.split(',');

    const want = list.map(s => String(s).trim().toLowerCase()).filter(Boolean);
    if (want.length) filter.tagsNorm = { $all: want }; // 必须同时包含全部标签

    const [works, total] = await Promise.all([
      Work.find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', 'username'),
      Work.countDocuments(filter)
    ]);

    res.json({
      works,
      page,
      limit,
      total,
      hasMore: skip + works.length < total
    });
  } catch (error) {
    res.status(500).json({ message: '获取作品失败', error: error.message });
  }
});

// 阅读端：只取元信息（可在这里增加 views）
// GET /api/works/:id/meta
router.get('/:id/meta', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const noView = req.query.noView === '1';

    const work = noView
      ? await Work.findById(id).populate('author', 'username')
      : await Work.findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true })
          .populate('author', 'username');

    if (!work) return res.status(404).json({ message: '作品不存在' });

    const pageCount = await getWorkPageCount(work);
    const obj = work.toObject();

    // meta 接口不返回正文 pages/content（避免慢网速首屏卡死）
    delete obj.pages;
    delete obj.content;

    res.json({
      ...obj,
      pageCount,
      pageStorage: work.pageStorage || 'embedded',
    });
  } catch (e) {
    res.status(500).json({ message: '获取作品元信息失败', error: e.message });
  }
});

// 阅读端：按批次取楼层内容（默认5楼；weak=1 强制2楼）
// GET /api/works/:id/page-batch?offset=0&limit=5&weak=1
router.get('/:id/page-batch', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    let limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 50);
    const weak = (req.query.weak === '1') || (req.query.mode === 'weak');
    if (weak) limit = 2;

    const work = await Work.findById(id).populate('author', 'username');
    if (!work) return res.status(404).json({ message: '作品不存在' });

    const pageCount = await getWorkPageCount(work);
    if (offset >= pageCount) {
      return res.json({ workId: id, offset, limit, pageCount, hasMore: false, pages: [] });
    }

    const pages = (work.pageStorage === 'separate')
      ? await getSeparatedPagesRange(work._id, offset, limit)
      : getEmbeddedPagesRange(work, offset, limit);

    res.json({
      workId: work._id,
      pageStorage: work.pageStorage || 'embedded',
      offset,
      limit,
      pageCount,
      hasMore: offset + pages.length < pageCount,
      pages,
    });
  } catch (e) {
    res.status(500).json({ message: '获取作品分页内容失败', error: e.message });
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

// **修改：创建新作品**
// ✅ 创建新作品：默认 separate（页面独立存 WorkPage）
router.post('/', auth, async (req, res) => {
  try {
    const { title, content } = req.body;

    // 允许前端仍传 content（页面数组），但我们不再嵌入 Work.content
    const pageArray = (Array.isArray(content) && content.length > 0)
      ? content
      : [{ content: { ops: [] } }];

    const normalizedPages = pageArray.map((p) => ({
      content: (p && typeof p.content === 'object') ? p.content : { ops: [] }
    }));

    const newWordCount = calculateWordCount(normalizedPages);

    // 1) 先建 Work（主文档保持“轻”）
    const newWork = new Work({
      title,
      author: req.userId,

      pageStorage: 'separate',
      pageCount: normalizedPages.length,
      wordCount: newWordCount,
      updatedAt: new Date(),

      // Work.content 只放占位，避免文档越来越大
      content: [{ content: { ops: [] } }],
    });

    await newWork.save();

    // 2) 再建 WorkPage（每页一条）
    const ops = normalizedPages.map((p, i) => ({
      updateOne: {
        filter: { workId: newWork._id, index: i },
        update: {
          $set: {
            workId: newWork._id,
            index: i,
            content: p.content,
            wordCount: calcPageWordCount(p.content),
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        },
        upsert: true
      }
    }));

    if (ops.length) await WorkPage.bulkWrite(ops, { ordered: false });

    res.status(201).json(newWork);
  } catch (error) {
    res.status(400).json({ message: '创建作品失败', error: error.message });
  }
});

// ✅ 更新作品（轻量）：不再允许 PUT 整本 pages/content（避免 413）
// 只允许更新 title 等元信息；页面内容请用 /:id/pages/*
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, coverImage, isPublished } = req.body;

    // 🚫 禁止整包 pages/content
    if (req.body.pages !== undefined || req.body.content !== undefined) {
      return res.status(400).json({
        message: '不再支持 PUT 整包 pages/content。请改用 /api/works/:id/pages/* 接口保存页面内容。若出现此信息请立刻联系站长'
      });
    }

    const updateDoc = { updatedAt: new Date() };
    if (title !== undefined) updateDoc.title = title;
    if (coverImage !== undefined) updateDoc.coverImage = coverImage;
    if (isPublished !== undefined) updateDoc.isPublished = isPublished;

    const updatedWork = await Work.findOneAndUpdate(
      { _id: id, author: req.userId },
      { $set: updateDoc },
      { new: true, timestamps: true }
    );

    if (!updatedWork) {
      return res.status(404).json({ message: '作品不存在或无权修改' });
    }

    res.json(updatedWork);
  } catch (error) {
    res.status(500).json({ message: '更新作品失败', error: error.message });
  }
});


// ✅ 兼容：作者全量 pages + 阅读端分页 batch（start/limit）
// GET /api/works/:id/pages
//   - 作者写作端（不传 start/limit）：返回全量 pages
//   - 阅读端（传 start/limit）：返回 batch（已发布 或 作者本人可读）
// 参数：start=0&limit=5&weak=1
router.get('/:id/pages', optionalAuth, async (req, res) => {
  try {
    const workId = req.params.id;

    // 是否 batch 模式（阅读端会传 start/limit）
    const hasStart = req.query.start !== undefined;
    const hasLimit = req.query.limit !== undefined;
    const isBatchMode = hasStart || hasLimit;

    const startRaw = parseInt(req.query.start, 10);
    const limitRaw = parseInt(req.query.limit, 10);
    const weak = String(req.query.weak || '') === '1';

    let start = Number.isFinite(startRaw) ? Math.max(startRaw, 0) : 0;
    let limit = Number.isFinite(limitRaw) ? limitRaw : 5;

    // weak 模式：至少 2，且强制上限 2（懒懒加载）
    if (weak) {
      if (!Number.isFinite(limit) || limit < 2) limit = 2;
      if (limit > 2) limit = 2;
    } else {
      // 正常懒加载：建议 1~10，默认 5
      if (!Number.isFinite(limit) || limit <= 0) limit = 5;
      limit = Math.min(limit, 10);
    }

    const work = await Work.findById(workId).lean();
    if (!work) return res.status(404).json({ message: '作品不存在' });

    const isOwner =
      req.userId && String(work.author) === String(req.userId);

    // 阅读权限：作者本人 OR 已发布
    const canRead = isOwner || work.isPublished === true;

    // 1) 阅读端 batch：允许已发布作品分段读取
    if (isBatchMode) {
      if (!canRead) {
        return res.status(404).json({ message: '作品不存在或无权查看' });
      }

      // pageCount
      let pageCount = 0;
      if (work.pageStorage === 'separate') {
        pageCount = Number.isFinite(work.pageCount) ? work.pageCount : 0;
        if (!pageCount) {
          pageCount = await WorkPage.countDocuments({ workId: work._id });
        }

        const docs = await WorkPage.find({
          workId: work._id,
          index: { $gte: start, $lt: start + limit },
        })
          .sort({ index: 1 })
          .lean();

        const pages = docs.map(p => ({
          index: p.index,
          content: rewriteUploadsInDelta(p.content || { ops: [] }),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }));

        const hasMore = start + pages.length < pageCount;

        return res.json({
          pageCount,
          start,
          limit,
          hasMore,
          pages,
        });
      }

      // 非 separate：从 work.content 切片返回
      const embedded = Array.isArray(work.content) ? work.content : [];
      pageCount = embedded.length;

      const slice = embedded.slice(start, start + limit).map((p, i) => {
        const obj = (p && typeof p.toObject === 'function') ? p.toObject() : p;
        const idx = start + i;
        return {
          index: idx,
          ...obj,
          content: rewriteUploadsInDelta(obj?.content || { ops: [] }),
        };
      });

      const hasMore = start + slice.length < pageCount;

      return res.json({
        pageCount,
        start,
        limit,
        hasMore,
        pages: slice,
      });
    }

    // 2) 作者全量模式（写作端兼容）：必须是 owner
    if (!isOwner) {
      return res.status(401).json({ message: '请先登录' });
    }

    if (work.pageStorage !== 'separate') {
      const pages = (work.content || []).map(p => {
        const obj = (p && typeof p.toObject === 'function') ? p.toObject() : p;
        return { ...obj, content: rewriteUploadsInDelta(obj?.content || { ops: [] }) };
      });
      return res.json({ pages });
    }

    const docs = await WorkPage.find({ workId: work._id }).sort({ index: 1 }).lean();
    const pages = docs.map(p => ({
      content: rewriteUploadsInDelta(p.content || { ops: [] }),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return res.json({ pages });
  } catch (e) {
    return res.status(500).json({ message: '获取 pages 失败', error: e.message });
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
    if (!work) return res.status(404).json({ message: '作品不存在或无权修改' });

    if (work.pageStorage !== 'separate') {
      return res.status(400).json({ message: '该作品不是 separate 存储（暂不支持单页保存）' });
    }

    const page = await WorkPage.findOne({ workId: work._id, index: pageIndex });
    if (!page) return res.status(404).json({ message: '页面不存在' });

    const oldWC = page.wordCount || 0;
    const newWC = calcPageWordCount(content);
    const diff = newWC - oldWC;

    page.content = content;
    page.wordCount = newWC;
    page.updatedAt = new Date();
    await page.save();

    work.wordCount = Math.max((work.wordCount || 0) + diff, 0);
    work.updatedAt = new Date();
    if (title !== undefined) work.title = title;
    await work.save();

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: '更新单页失败', error: e.message });
  }
});

router.post('/:id/pages', auth, async (req, res) => {
  try {
    const work = await Work.findOne({ _id: req.params.id, author: req.userId });
    if (!work) return res.status(404).json({ message: '作品不存在或无权修改' });
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

    res.status(201).json({ index: newIndex });
  } catch (e) {
    res.status(500).json({ message: '新增页面失败', error: e.message });
  }
});

router.delete('/:id/pages/:pageIndex', auth, async (req, res) => {
  try {
    const pageIndex = Number(req.params.pageIndex);
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      return res.status(400).json({ message: 'pageIndex 不合法' });
    }

    const work = await Work.findOne({ _id: req.params.id, author: req.userId });
    if (!work) return res.status(404).json({ message: '作品不存在或无权修改' });
    if (work.pageStorage !== 'separate') {
      return res.status(400).json({ message: '该作品不是 separate 存储（暂不支持删页）' });
    }

    if ((work.pageCount || 0) <= 1) {
      return res.status(400).json({ message: '至少保留一页' });
    }

    const deleted = await WorkPage.findOneAndDelete({ workId: work._id, index: pageIndex });
    if (!deleted) return res.status(404).json({ message: '页面不存在' });

    await WorkPage.updateMany(
      { workId: work._id, index: { $gt: pageIndex } },
      { $inc: { index: -1 } }
    );

    work.pageCount = Math.max((work.pageCount || 1) - 1, 1);
    work.wordCount = Math.max((work.wordCount || 0) - (deleted.wordCount || 0), 0);
    work.updatedAt = new Date();
    await work.save();

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: '删除页面失败', error: e.message });
  }
});



// **新增：支持页面(pages)删除/更新的 PATCH 路由**
// 前端使用 PATCH /api/works/:id 发送 { pages: newPages }
// **新增：支持页面(pages)删除/更新 + 特效/背景配置的 PATCH 路由**
// 前端使用 PATCH /api/works/:id
//  - 更新页：{ pages: newPages, title? }
//  - 更新特效：{ effectsDraft, effectsPublished? }
//  - 更新背景：{ backgroundDraft, backgroundPublished? }
router.patch('/:id', auth, async (req, res) => {
    try {
        // ⭐ 一些字段可能被前端当成字符串传上来，这里统一尝试解析 JSON
        const jsonKeys = [
            'effectsDraft',
            'effectsPublished',
            'backgroundDraft',
            'backgroundPublished',
        ];

        jsonKeys.forEach((key) => {
            if (typeof req.body[key] === 'string') {
                try {
                    req.body[key] = JSON.parse(req.body[key]);
                } catch (e) {
                    console.warn(`PATCH /:id 解析 ${key} JSON 失败:`, e.message);
                    // 解析失败就保持原样，不中断请求
                }
            }
        });

        const { id } = req.params;

        // 从请求体中解构出前端可能发送的字段
        const {
            pages,
            title,
            backgroundDraft,
            backgroundPublished,
            ...otherFields
        } = req.body;

        // otherFields 里会包含：effectsDraft / effectsPublished 等
        const updateFields = { ...otherFields };

        // ========= 1）如果有 pages，则更新 content + 字数（考虑到作品大小上限，已禁用） =========
        

        // ========= 2）允许同时更新 title =========
        if (title !== undefined) {
            updateFields.title = title;
        }

        // ========= 3）背景配置：草稿 & 已发布 =========
        // backgroundDraft/backgroundPublished 的结构：
        // { images: [], bindings: [], transitions: [] }
        if (backgroundDraft && typeof backgroundDraft === 'object') {
            updateFields.backgroundDraft = {
                images: Array.isArray(backgroundDraft.images)
                    ? backgroundDraft.images
                    : [],
                bindings: Array.isArray(backgroundDraft.bindings)
                    ? backgroundDraft.bindings
                    : [],
                transitions: Array.isArray(backgroundDraft.transitions)
                    ? backgroundDraft.transitions
                    : [],
            };
        }

        if (backgroundPublished && typeof backgroundPublished === 'object') {
            updateFields.backgroundPublished = {
                images: Array.isArray(backgroundPublished.images)
                    ? backgroundPublished.images
                    : [],
                bindings: Array.isArray(backgroundPublished.bindings)
                    ? backgroundPublished.bindings
                    : [],
                transitions: Array.isArray(backgroundPublished.transitions)
                    ? backgroundPublished.transitions
                    : [],
            };
        }

        // ========= 4）如果没有任何需要更新的字段 =========
        if (Object.keys(updateFields).length === 0) {
            return res.status(200).json({ message: '没有需要更新的字段' });
        }

        const updatedWork = await Work.findOneAndUpdate(
            { _id: id, author: req.userId },
            { $set: updateFields }, // 使用 $set 进行部分字段更新
            { new: true, timestamps: true }
        );

        if (!updatedWork) {
            return res
                .status(404)
                .json({ message: '作品不存在或无权修改' });
        }

        res.json(updatedWork);
    } catch (error) {
        console.error('PATCH /:id 更新作品失败:', error);
        res
            .status(500)
            .json({ message: '更新作品失败', error: error.message });
    }
});


// 删除作品
router.delete('/:id', auth, async (req, res) => {
  try {
    const work = await Work.findOneAndDelete({ _id: req.params.id, author: req.userId });
    if (!work) {
      return res.status(404).json({ message: '作品不存在或无权删除' });
    }

    // ✅ 同时清理分页数据
    await WorkPage.deleteMany({ workId: work._id });

    res.json({ message: '作品删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除失败', error: error.message });
  }
});


// 修改：获取单个作品的路由（用于阅读页面），并增加浏览量
// ✅ 修复版：获取单个作品（阅读页）+ 增加浏览量
router.get('/:id', optionalAuth, async (req, res) => {
  const handlerStart = Date.now();
  console.log(`📥 [WORK GET] start, id = ${req.params.id}`);

  try {
    const workId = req.params.id;

    const dbStart = Date.now();
    const work = await Work.findByIdAndUpdate(
      workId,
      { $inc: { views: 1 } },
      { new: true, timestamps: false }
    ).populate('author', 'username');
    const dbEnd = Date.now();

    if (!work) {
      console.log(`❗ [WORK GET] not found, DB time = ${dbEnd - dbStart} ms`);
      return res.status(404).json({ message: '作品不存在' });
    }

    const processStart = Date.now();
    const isLikedByCurrentUser = req.userId
  ? Array.isArray(work.likedBy) && work.likedBy.some(x => String(x) === String(req.userId))
  : false;


    // ✅ 先算 pages（可 await）
    let pages = [];
    if (work.pageStorage === 'separate') {
      const docs = await WorkPage.find({ workId: work._id }).sort({ index: 1 }).lean();
      pages = docs.map(p => ({
        content: rewriteUploadsInDelta(p.content || { ops: [] }),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
    } else {
      pages = (work.content || []).map(page => {
        const obj = page.toObject ? page.toObject() : page;
        return { ...obj, content: rewriteUploadsInDelta(obj.content) };
      });
    }

    // ✅ 再组 responseWork（纯对象）
    const responseWork = {
      _id: work._id,
      title: work.title,
      author: work.author,
      views: work.views,
      likesCount: work.likesCount,
      isLikedByCurrentUser,
      updatedAt: work.updatedAt,
      createdAt: work.createdAt,

      effectsDraft: work.effectsDraft || [],
      effectsPublished: work.effectsPublished || [],

      backgroundDraft: work.backgroundDraft || { images: [], bindings: [], transitions: [] },
      backgroundPublished: work.backgroundPublished || { images: [], bindings: [], transitions: [] },

      // ✅ 同时返回 content/pages 兼容老前端
      content: pages,
      pages: pages,
    };

    const processEnd = Date.now();
    const handlerEnd = Date.now();
    console.log(
      `✅ [WORK GET] id=${workId}
         DB time       : ${dbEnd - dbStart} ms
         Process time  : ${processEnd - processStart} ms
         Handler total : ${handlerEnd - handlerStart} ms`
    );

    return res.json(responseWork);
  } catch (error) {
    const handlerEnd = Date.now();
    console.error('获取作品失败:', error);
    console.log(`❌ [WORK GET] error, total = ${handlerEnd - handlerStart} ms`);
    return res.status(500).json({ message: '获取作品失败', error: error.message });
  }
});


// **新增：作品点赞/取消点赞的路由**
router.post('/:id/like', auth, async (req, res) => {
    try {
        const work = await Work.findById(req.params.id);
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }

        const userId = String(req.userId);
const index = Array.isArray(work.likedBy)
  ? work.likedBy.findIndex(x => String(x) === userId)
  : -1;

        
        if (index > -1) {
  work.likedBy.splice(index, 1);
  work.likesCount = Math.max((work.likesCount || 0) - 1, 0);
} else {
  work.likedBy.push(req.userId);
  work.likesCount = (work.likesCount || 0) + 1;
}


        await work.save();

        res.json({
            likesCount: work.likesCount,
            isLikedByCurrentUser: index === -1 // 如果是新增点赞，则状态为 true
        });

    } catch (error) {
        console.error('Work like/unlike error:', error);
        res.status(500).json({ message: '点赞操作失败', error: error.message });
    }
});

// **新增：角色相关的 API 路由**

// 获取单个作品的所有角色
router.get('/:id/roles', auth, async (req, res) => {
    try {
        const work = await Work.findById(req.params.id);
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权查看此作品的角色' });
        }
        res.json(work.roles);
    } catch (error) {
        res.status(500).json({ message: '获取角色失败', error: error.message });
    }
});

// 为作品添加新角色
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
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权修改此作品' });
        }

        // 创建新角色对象并推入数组
        work.roles.push({ name, notes, color });
        await work.save();

        // 返回新创建的角色对象，其 _id 由 MongoDB 自动生成
        const newRole = work.roles[work.roles.length - 1];
        res.status(201).json(newRole);
    } catch (error) {
        res.status(500).json({ message: '添加角色失败', error: error.message });
    }
});

// 更新作品中的某个角色
router.put('/:workId/roles/:roleId', auth, async (req, res) => {
    try {
        const { workId, roleId } = req.params;
        // 修改：从请求体中解构出 gallery 字段
        const { name, notes, color, gallery } = req.body;

        const work = await Work.findById(workId);
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权修改此作品' });
        }
        
        // 找到并更新指定的角色
        const roleToUpdate = work.roles.id(roleId);
        if (!roleToUpdate) {
            return res.status(404).json({ message: '角色未找到' });
        }

        roleToUpdate.name = name ?? roleToUpdate.name;
        roleToUpdate.notes = notes ?? roleToUpdate.notes;
        roleToUpdate.color = color ?? roleToUpdate.color;
        
        // 新增：如果请求体中包含 gallery 字段，则更新它
        // 使用 ?? 确保只有在 gallery 存在时才进行更新
        if (gallery !== undefined) {
            roleToUpdate.gallery = gallery;
        }

        await work.save();
        res.json(roleToUpdate);

    } catch (error) {
        res.status(500).json({ message: '更新角色失败', error: error.message });
    }
});

// 删除作品中的某个角色
router.delete('/:workId/roles/:roleId', auth, async (req, res) => {
    try {
        const { workId, roleId } = req.params;
        
        const work = await Work.findById(workId);
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权修改此作品' });
        }

        work.roles.pull({ _id: roleId });
        await work.save();

        res.json({ message: '角色删除成功' });
    } catch (error) {
        res.status(500).json({ message: '删除角色失败', error: error.message });
    }
});

// ... [在文件末尾或其他合适位置添加以下代码] ...

// ------------------------------------------------------------------
// **新增：骰子记录相关的 API 路由**
// ------------------------------------------------------------------

// 记录一次骰子使用情况 (POST /api/work/:id/dice-log)
router.post('/:id/dice-log', auth, async (req, res) => {
    try {
        const workId = req.params.id;
        // 接收前端发送的记录数据
        const { rollType, result, rollText } = req.body; 
        
        if (!rollType || typeof result !== 'number' || !rollText) {
            return res.status(400).json({ message: '缺少骰子记录所需的参数' });
        }

        const work = await Work.findById(workId);
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权修改此作品' });
        }

        // 创建新的骰子记录对象，使用服务器时间
        const newLog = {
            rollType,
            result,
            rollText,
            timestamp: new Date()
        };

        // 将新记录添加到数组最前面 (unshift)
        work.diceLog.unshift(newLog);

        // 可选：限制记录数量，例如只保留最新的 100 条，防止数据库字段过大
        if (work.diceLog.length > 100) {
             work.diceLog = work.diceLog.slice(0, 100);
        }

        await work.save();

        // 返回新记录和状态
        res.status(201).json({ message: '骰子记录成功', logEntry: newLog });

    } catch (error) {
        console.error('Dice log error:', error);
        res.status(500).json({ message: '记录骰子失败', error: error.message });
    }
});

// 获取作品的骰子记录 (GET /api/work/:id/dice-log)
router.get('/:id/dice-log', auth, async (req, res) => {
    try {
        const workId = req.params.id;

        // 只查询 diceLog 字段
        const work = await Work.findById(workId).select('diceLog author'); 
        if (!work) {
            return res.status(404).json({ message: '作品未找到' });
        }
        if (work.author.toString() !== req.userId) {
            return res.status(403).json({ message: '无权查看此作品的骰子记录' });
        }

        // 返回骰子记录列表
        res.json(work.diceLog);

    } catch (error) {
        res.status(500).json({ message: '获取骰子记录失败', error: error.message });
    }
});


module.exports = router;
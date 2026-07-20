const WorkPage = require('../models/WorkPage');
const User = require('../models/User');

function isAdminRequest(req) {
  const adminIds = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const uid = String(
    req.userId ||
    req.user?._id ||
    req.user?.id ||
    ''
  );

  return uid && adminIds.includes(uid);
}

async function requireAdmin(req, res, next) {
  try {
    if (isAdminRequest(req)) return next();

    const userId = req.userId || req.userData?.userId;
    if (!userId) {
      return res.status(403).json({ message: '需要管理员权限' });
    }

    const user = await User.findById(userId).select('roles').lean();
    if (Array.isArray(user?.roles) && user.roles.includes('admin')) {
      return next();
    }

    return res.status(403).json({ message: '需要管理员权限' });
  } catch (error) {
    return res.status(500).json({ message: '管理员权限校验失败', error: error.message });
  }
}

function buildOptionalAuth(decodeRequestUser) {
  return (req, res, next) => {
    const decoded = decodeRequestUser(req);
    req.userData = decoded || null;
    req.userId = decoded?.userId || null;
    next();
  };
}

function calculateWordCount(pages) {
  if (!Array.isArray(pages) || pages.length === 0) {
    return 0;
  }

  return pages.reduce((sum, page) => {
    if (!page.content) return sum;
    if (typeof page.content === 'object' && Array.isArray(page.content.ops)) {
      const text = page.content.ops.map((op) => op.insert || '').join('');
      const cleanText = text.replace(/[\n\r\t\s\u200B-\u200D\uFEFF]/g, '');
      return sum + cleanText.length;
    }
    return sum;
  }, 0);
}

function calcPageWordCount(content) {
  if (!content || typeof content !== 'object' || !Array.isArray(content.ops)) return 0;
  const text = content.ops.map((op) => (typeof op.insert === 'string' ? op.insert : '')).join('');
  return text.replace(/[\n\r\t\s\u200B-\u200D\uFEFF]/g, '').length;
}

function normalizePageForResponse(pageObj) {
  return {
    content: pageObj.content || { ops: [] },
    createdAt: pageObj.createdAt || new Date(),
    updatedAt: pageObj.updatedAt || new Date(),
  };
}

function rewriteUploadsInDelta(deltaObj) {
  if (!deltaObj || typeof deltaObj !== 'object') return deltaObj;
  try {
    let serialized = JSON.stringify(deltaObj);
    serialized = serialized.replace(/http:\/\/api\.anchorx\.ca\/uploads/g, 'https://api.anchorx.ca/uploads');
    return JSON.parse(serialized);
  } catch (error) {
    return deltaObj;
  }
}

async function ensureSeparated(work) {
  if (!work || work.pageStorage === 'separate') return;

  const embeddedPages = Array.isArray(work.content) && work.content.length > 0
    ? work.content
    : [{ content: { ops: [] } }];

  const ops = embeddedPages.map((page, index) => {
    const content = page?.content || { ops: [] };
    return {
      updateOne: {
        filter: { workId: work._id, index },
        update: {
          $set: {
            workId: work._id,
            index,
            content,
            wordCount: calcPageWordCount(content),
            createdAt: page.createdAt || new Date(),
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    };
  });

  if (ops.length) {
    await WorkPage.bulkWrite(ops, { ordered: false });
  }

  const totalWordCount = embeddedPages.reduce((sum, page) => sum + calcPageWordCount(page?.content), 0);

  work.pageStorage = 'separate';
  work.pageCount = embeddedPages.length;
  work.pagesMigratedAt = new Date();
  work.wordCount = totalWordCount;
  work.content = [{ content: { ops: [] } }];

  await work.save();
}

async function getSeparatedPages(workId) {
  const pageDocs = await WorkPage.find({ workId }).sort({ index: 1 }).lean();
  return pageDocs.map((page) => normalizePageForResponse(page));
}

async function getSeparatedPagesRange(workId, offset = 0, limit = 5) {
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 50);

  const pageDocs = await WorkPage.find({
    workId,
    index: { $gte: safeOffset, $lt: safeOffset + safeLimit },
  }).sort({ index: 1 }).lean();

  return pageDocs.map((page) => ({
    ...normalizePageForResponse(page),
    index: page.index,
    content: rewriteUploadsInDelta(page.content || { ops: [] }),
  }));
}

async function getWorkPageCount(work) {
  if (!work) return 1;
  if (work.pageStorage === 'separate') {
    if (typeof work.pageCount === 'number' && work.pageCount > 0) return work.pageCount;
    return WorkPage.countDocuments({ workId: work._id });
  }
  if (Array.isArray(work.content) && work.content.length > 0) return work.content.length;
  return 1;
}

function getEmbeddedPagesRange(work, offset = 0, limit = 5) {
  const pages = (Array.isArray(work.content) && work.content.length > 0)
    ? work.content
    : [{ content: { ops: [] } }];

  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 50);

  return pages.slice(safeOffset, safeOffset + safeLimit).map((page, index) => ({
    ...normalizePageForResponse(page),
    index: safeOffset + index,
    content: rewriteUploadsInDelta(page?.content || { ops: [] }),
  }));
}

function canonicalizeTag(raw) {
  if (raw === null || raw === undefined) return '';
  let value = String(raw).replace(/\s+/g, ' ').trim();
  if (!value) return '';
  value = value.replace(/：/g, ':');
  value = value.replace(/\s*:\s*/g, ':');
  return value;
}

function tagNormKey(raw) {
  const normalized = canonicalizeTag(raw);
  return normalized ? normalized.toLowerCase() : '';
}

function expandTagNormVariants(raw) {
  const base = canonicalizeTag(raw);
  const lower = base.toLowerCase();
  if (!lower) return [];

  const variants = new Set();
  variants.add(lower);
  variants.add(String(raw).replace(/\s+/g, ' ').trim().toLowerCase());
  variants.add(lower.replace(/:/g, ': '));
  variants.add(lower.replace(/:/g, ' : '));
  variants.add(lower.replace(/:/g, '：'));
  variants.add(lower.replace(/:/g, '： '));
  variants.add(lower.replace(/:/g, ' ： '));

  return Array.from(variants).filter(Boolean);
}

function normalizeTagsInput(input) {
  const arrayInput = Array.isArray(input) ? input : [];
  const tags = [];
  const tagsNorm = [];
  const seen = new Set();

  for (const raw of arrayInput) {
    let tag = canonicalizeTag(raw);
    if (!tag) continue;

    if (tag.length > 32) tag = tag.slice(0, 32);

    const normalized = tagNormKey(tag);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    tags.push(tag);
    tagsNorm.push(normalized);

    if (tags.length >= 30) break;
  }

  return { tags, tagsNorm };
}

module.exports = {
  buildOptionalAuth,
  calcPageWordCount,
  calculateWordCount,
  canonicalizeTag,
  ensureSeparated,
  expandTagNormVariants,
  getEmbeddedPagesRange,
  getSeparatedPages,
  getSeparatedPagesRange,
  getWorkPageCount,
  isAdminRequest,
  normalizePageForResponse,
  normalizeTagsInput,
  requireAdmin,
  rewriteUploadsInDelta,
  tagNormKey,
};

const Work = require('../models/Work');
const WorkPage = require('../models/WorkPage');

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

function normalizeEmbeddedPage(page) {
  const plainPage = page?.toObject ? page.toObject() : page;

  return {
    ...(plainPage || {}),
    content: rewriteUploadsInDelta(plainPage?.content || { ops: [] }),
    createdAt: plainPage?.createdAt,
    updatedAt: plainPage?.updatedAt,
  };
}

async function getPagesForRead(work) {
  if (work.pageStorage === 'separate') {
    const pageDocs = await WorkPage.find({ workId: work._id }).sort({ index: 1 }).lean();
    return pageDocs.map((page) => ({
      content: rewriteUploadsInDelta(page.content || { ops: [] }),
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    }));
  }

  return (work.content || []).map(normalizeEmbeddedPage);
}

async function loadWorkForRead(workId, { viewerUserId = null, incrementViews = false } = {}) {
  const query = incrementViews
    ? Work.findByIdAndUpdate(workId, { $inc: { views: 1 } }, { new: true, timestamps: false })
    : Work.findById(workId);

  const work = await query.populate('author', 'username');
  if (!work) return null;

  const pages = await getPagesForRead(work);
  const isLikedByCurrentUser = viewerUserId
    ? Array.isArray(work.likedBy) && work.likedBy.some((id) => String(id) === String(viewerUserId))
    : false;

  return {
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
    content: pages,
    pages,
  };
}

module.exports = {
  loadWorkForRead,
  rewriteUploadsInDelta,
};

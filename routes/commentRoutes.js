//commentRoutes.js

const express = require('express');
const mongoose = require('mongoose');

const Comment = require('../models/Comment');
const auth = require('../authMiddleware');
const { decodeRequestUser } = require('../services/authService');
const {
  createCommentLikeNotification,
  createCommentNotification,
} = require('../services/notificationService');

const router = express.Router();

function getCurrentUserId(req) {
  return decodeRequestUser(req)?.userId || null;
}

function formatComment(comment, currentUserId) {
  const likes = Array.isArray(comment.likes) ? comment.likes : [];
  const authorName = comment.author?.username || '匿名用户';

  return {
    _id: comment._id,
    content: comment.content,
    author: authorName,
    createdAt: comment.createdAt,
    sentenceId: comment.sentenceId,
    likesCount: likes.length,
    isLikedByCurrentUser: currentUserId
      ? likes.some((likeId) => String(likeId) === String(currentUserId))
      : false,
  };
}

router.post('/work/by-sentence-ids/:workId', async (req, res) => {
  try {
    const workId = req.params.workId;
    const sentenceIdsRaw = req.body?.sentenceIds;

    if (!Array.isArray(sentenceIdsRaw)) {
      return res.status(400).json({ message: 'sentenceIds 必须是数组' });
    }

    const sentenceIds = sentenceIdsRaw
      .map((value) => (value == null ? '' : String(value).trim()))
      .filter(Boolean);

    if (!sentenceIds.length) {
      return res.json([]);
    }

    if (sentenceIds.length > 800) {
      return res.status(400).json({ message: 'sentenceIds 过多，请分批请求' });
    }

    const currentUserId = getCurrentUserId(req);
    const workOr = [{ workId }];

    if (mongoose.Types.ObjectId.isValid(workId)) {
      workOr.push({ workId: new mongoose.Types.ObjectId(workId) });
    }

    const comments = await Comment.find({
      sentenceId: { $in: sentenceIds },
      $or: workOr,
    })
      .populate('author', 'username')
      .sort({ createdAt: 1 });

    res.json(comments.map((comment) => formatComment(comment, currentUserId)));
  } catch (error) {
    res.status(500).json({ message: '批量获取评论失败', error: error.message });
  }
});

router.get('/work/:workId', async (req, res) => {
  try {
    const { workId } = req.params;
    const currentUserId = getCurrentUserId(req);

    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const limitRaw = req.query.limit;
    const limit = limitRaw === undefined
      ? null
      : Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 500);

    let query = Comment.find({ workId })
      .populate('author', 'username')
      .sort({ createdAt: 1 });

    if (skip) query = query.skip(skip);
    if (limit !== null) query = query.limit(limit);

    const comments = await query;
    res.json(comments.map((comment) => formatComment(comment, currentUserId)));
  } catch (error) {
    res.status(500).json({ message: '获取作品评论失败', error: error.message });
  }
});

router.get('/:workId/:sentenceId', async (req, res) => {
  try {
    const { workId, sentenceId } = req.params;
    const currentUserId = getCurrentUserId(req);

    const comments = await Comment.find({ workId, sentenceId })
      .populate('author', 'username')
      .sort({ createdAt: 1 });

    console.log('[GET COMMENTS]', comments.map((comment) => ({
      id: comment._id.toString(),
      likesCount: (comment.likes || []).length,
      likes: (comment.likes || []).map((id) => id.toString()),
    })));

    res.json(comments.map((comment) => formatComment(comment, currentUserId)));
  } catch (error) {
    res.status(500).json({ message: '获取评论失败', error: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  console.log('[POST /api/comments] incoming:', req.body, 'userId:', req.userId);

  try {
    const { workId, sentenceId, content } = req.body;
    const normalizedSentenceId = String(sentenceId).startsWith('s_')
      ? sentenceId
      : `s_${workId}_${sentenceId}`;

    const savedComment = await new Comment({
      workId,
      sentenceId: normalizedSentenceId,
      author: req.userId,
      content,
      likes: [],
    }).save();

    await createCommentNotification({
      workId: savedComment.workId,
      commentId: savedComment._id,
      senderId: req.userId,
    });

    const populatedComment = await Comment.findById(savedComment._id)
      .populate('author', 'username');

    res.status(201).json({
      _id: populatedComment._id,
      content: populatedComment.content,
      author: populatedComment.author?.username || '匿名用户',
      createdAt: populatedComment.createdAt,
      sentenceId: normalizedSentenceId,
      likesCount: 0,
      isLikedByCurrentUser: false,
    });
  } catch (error) {
    console.error('[POST /api/comments] Error:', error);
    res.status(400).json({ message: '发表评论失败', error: error.message });
  }
});

router.post('/:id/like', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const comment = await Comment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: '评论不存在' });
    }

    const index = comment.likes.findIndex((likeId) => String(likeId) === String(userId));

    if (index > -1) {
      comment.likes.splice(index, 1);
    } else {
      comment.likes.push(userId);
      await createCommentLikeNotification({
        commentAuthorId: comment.author,
        commentId: comment._id,
        senderId: userId,
      });
    }

    await comment.save();

    console.log('[LIKE]', {
      id: comment._id.toString(),
      likesCount: comment.likes.length,
      likes: comment.likes.map((likeId) => likeId.toString()),
    });

    res.json({
      likesCount: comment.likes.length,
      isLikedByCurrentUser: comment.likes.some((likeId) => String(likeId) === String(userId)),
    });
  } catch (error) {
    res.status(500).json({ message: '点赞操作失败', error: error.message });
  }
});

router.get('/work/commented-sentences/:workId', async (req, res) => {
  try {
    const { workId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(workId)) {
      return res.status(400).json({ message: '作品ID格式无效' });
    }

    const oid = new mongoose.Types.ObjectId(workId);
    const result = await Comment.aggregate([
      { $match: { $or: [{ workId }, { workId: oid }] } },
      { $group: { _id: '$sentenceId' } },
    ]);

    res.json(result.map((item) => item._id).filter(Boolean));
  } catch (error) {
    console.error('[GET commented-sentences] Error:', error);
    res.status(500).json({ message: '获取有评论的句子ID失败', error: error.message });
  }
});

module.exports = router;

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const Topic = require('../models/Topic');
const Reply = require('../models/Reply');
const User = require('../models/User');
const auth = require('../authMiddleware');
const {
  createTopicLikeNotification,
  createTopicReplyLikeNotification,
  createTopicReplyNotifications,
} = require('../services/notificationService');

const router = express.Router();

const uploadDir = 'public/uploads';
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (error) {
  // ignore directory exists errors
}

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

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function isAdminUser(userId) {
  const actingUser = await User.findById(userId).select('roles').lean();
  const adminIds = String(process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return adminIds.includes(String(userId))
    || (Array.isArray(actingUser?.roles) && actingUser.roles.includes('admin'));
}

router.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'æ²¡æœ‰ä¸Šä¼ æ–‡ä»¶' });
    }

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    return res.status(200).json({ message: 'ä¸Šä¼ æˆåŠŸ', imageUrl });
  } catch (error) {
    return res.status(500).json({ message: 'ä¸Šä¼ å¤±è´¥', error: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { title, content, section } = req.body;
    const author = req.userData.userId;

    const newTopic = new Topic({
      title,
      content,
      author,
      section,
      lastReplyAt: new Date(),
      lastRepliedBy: author,
    });

    await newTopic.save();
    return res.status(201).json({ message: 'ä¸»é¢˜åˆ›å»ºæˆåŠŸ', topicId: newTopic._id });
  } catch (error) {
    console.error('åˆ›å»ºä¸»é¢˜å¤±è´¥:', error);
    return res.status(400).json({ message: 'åˆ›å»ºä¸»é¢˜å¤±è´¥', error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const section = req.query.section;
    const skip = (page - 1) * limit;

    const filter = {};
    if (section) {
      filter.section = section;
    }

    const topics = await Topic.find(filter)
      .sort({ isPinned: -1, pinnedAt: -1, lastReplyAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'username lastActiveAt avatarUrl')
      .populate('lastRepliedBy', 'username lastActiveAt avatarUrl')
      .select('-content -likedBy')
      .exec();

    const totalTopics = await Topic.countDocuments(filter);

    return res.json({
      topics,
      currentPage: page,
      totalPages: Math.ceil(totalTopics / limit),
      totalTopics,
    });
  } catch (error) {
    console.error('èŽ·å–ä¸»é¢˜åˆ—è¡¨å¤±è´¥:', error);
    return res.status(500).json({ message: 'èŽ·å–ä¸»é¢˜åˆ—è¡¨å¤±è´¥', error: error.message });
  }
});

router.get('/:topicId', async (req, res) => {
  const { topicId } = req.params;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  if (!isValidObjectId(topicId)) {
    return res.status(400).json({ message: 'æ— æ•ˆçš„ä¸»é¢˜ID' });
  }

  try {
    const topic = await Topic.findById(topicId)
      .populate('author', 'username lastActiveAt avatarUrl')
      .select('-__v')
      .exec();

    if (!topic) {
      return res.status(404).json({ message: 'æ‰¾ä¸åˆ°è¯¥ä¸»é¢˜' });
    }

    Topic.findByIdAndUpdate(topicId, { $inc: { viewsCount: 1 } }).exec();

    const totalReplies = await Reply.countDocuments({ topic: topicId });
    const replies = await Reply.find({ topic: topicId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'username lastActiveAt avatarUrl')
      .populate({
        path: 'parentReply',
        select: 'content author',
        populate: {
          path: 'author',
          select: 'username avatarUrl',
        },
      })
      .lean()
      .exec();

    return res.json({
      topic,
      replies,
      replyPage: page,
      replyTotalPages: Math.ceil(totalReplies / limit),
      totalReplies,
    });
  } catch (error) {
    console.error('èŽ·å–ä¸»é¢˜è¯¦æƒ…å¤±è´¥:', error);
    return res.status(500).json({ message: 'èŽ·å–ä¸»é¢˜è¯¦æƒ…å¤±è´¥', error: error.message });
  }
});

router.post('/:topicId/replies', auth, async (req, res) => {
  const { topicId } = req.params;
  const { content, parentId } = req.body;
  const authorId = req.userData.userId;

  if (!isValidObjectId(topicId)) {
    return res.status(400).json({ message: 'æ— æ•ˆçš„ä¸»é¢˜ID' });
  }

  try {
    const topic = await Topic.findById(topicId).select('author');
    if (!topic) {
      return res.status(404).json({ message: 'å›žå¤çš„ä¸»é¢˜ä¸å­˜åœ¨' });
    }

    let parentReply = null;
    if (parentId) {
      if (!isValidObjectId(parentId)) {
        return res.status(400).json({ message: 'æ— æ•ˆçš„çˆ¶å›žå¤ID' });
      }

      parentReply = await Reply.findOne({ _id: parentId, topic: topicId }).select('author');
      if (!parentReply) {
        return res.status(404).json({ message: 'çˆ¶å›žå¤ä¸å­˜åœ¨æˆ–ä¸å±žäºŽå½“å‰ä¸»é¢˜' });
      }
    }

    const newReply = new Reply({
      topic: topicId,
      content,
      author: authorId,
      parentReply: parentReply?._id || null,
    });
    await newReply.save();

    await Topic.findByIdAndUpdate(topicId, {
      $inc: { repliesCount: 1 },
      lastReplyAt: newReply.createdAt,
      lastRepliedBy: authorId,
    });

    await createTopicReplyNotifications({
      topicId,
      replyId: newReply._id,
      senderId: authorId,
      parentReplyAuthorId: parentReply?.author || null,
      replyContent: content,
    });

    const populatedReply = await Reply.findById(newReply._id)
      .populate('author', 'username lastActiveAt avatarUrl')
      .lean();

    return res.status(201).json({
      message: 'å›žå¤æˆåŠŸ',
      reply: populatedReply,
    });
  } catch (error) {
    console.error('æ·»åŠ å›žå¤å¤±è´¥:', error);
    return res.status(500).json({ message: 'æ·»åŠ å›žå¤å¤±è´¥', error: error.message });
  }
});

router.post('/:topicId/like', auth, async (req, res) => {
  const { topicId } = req.params;
  const userId = req.userData.userId;

  if (!isValidObjectId(topicId)) {
    return res.status(400).json({ message: 'æ— æ•ˆçš„ä¸»é¢˜ID' });
  }

  try {
    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ message: 'ä¸»é¢˜ä¸å­˜åœ¨' });
    }

    if (!Array.isArray(topic.likedBy)) {
      topic.likedBy = [];
    }

    const userLikedIndex = topic.likedBy.findIndex((id) => String(id) === String(userId));

    if (userLikedIndex === -1) {
      topic.likedBy.push(userId);
      topic.likesCount += 1;
      await topic.save();

      await createTopicLikeNotification({ topicId: topic._id, senderId: userId });

      return res.status(200).json({
        message: 'ç‚¹èµžæˆåŠŸ',
        isLiked: true,
        likesCount: topic.likesCount,
      });
    }

    topic.likedBy.splice(userLikedIndex, 1);
    topic.likesCount = Math.max((topic.likesCount || 0) - 1, 0);
    await topic.save();

    return res.status(200).json({
      message: 'å–æ¶ˆç‚¹èµžæˆåŠŸ',
      isLiked: false,
      likesCount: topic.likesCount,
    });
  } catch (error) {
    console.error('ä¸»é¢˜ç‚¹èµžæ“ä½œå¤±è´¥:', error);
    return res.status(500).json({ message: 'ä¸»é¢˜ç‚¹èµžæ“ä½œå¤±è´¥', error: error.message });
  }
});

router.post('/replies/:replyId/like', auth, async (req, res) => {
  const { replyId } = req.params;
  const userId = req.userData.userId;

  if (!isValidObjectId(replyId)) {
    return res.status(400).json({ message: 'æ— æ•ˆçš„å›žå¤ID' });
  }

  try {
    const reply = await Reply.findById(replyId);
    if (!reply) {
      return res.status(404).json({ message: 'å›žå¤ä¸å­˜åœ¨' });
    }

    if (!Array.isArray(reply.likedBy)) {
      reply.likedBy = [];
    }

    const userLikedIndex = reply.likedBy.findIndex((id) => String(id) === String(userId));

    if (userLikedIndex === -1) {
      reply.likedBy.push(userId);
      reply.likesCount += 1;
      await reply.save();

      await createTopicReplyLikeNotification({ replyId: reply._id, senderId: userId });

      return res.status(200).json({
        message: 'ç‚¹èµžæˆåŠŸ',
        isLiked: true,
        likesCount: reply.likesCount,
      });
    }

    reply.likedBy.splice(userLikedIndex, 1);
    reply.likesCount = Math.max((reply.likesCount || 0) - 1, 0);
    await reply.save();

    return res.status(200).json({
      message: 'å–æ¶ˆç‚¹èµžæˆåŠŸ',
      isLiked: false,
      likesCount: reply.likesCount,
    });
  } catch (error) {
    console.error('å›žå¤ç‚¹èµžæ“ä½œå¤±è´¥:', error);
    return res.status(500).json({ message: 'å›žå¤ç‚¹èµžæ“ä½œå¤±è´¥', error: error.message });
  }
});

router.post('/:topicId/pin', auth, async (req, res) => {
  try {
    const { topicId } = req.params;
    const { isPinned } = req.body;

    if (!isValidObjectId(topicId)) {
      return res.status(400).json({ message: 'æ— æ•ˆçš„ä¸»é¢˜ID' });
    }

    if (!(await isAdminUser(req.userData.userId))) {
      return res.status(403).json({ message: 'æ— æƒé™' });
    }

    const topic = await Topic.findById(topicId);
    if (!topic) {
      return res.status(404).json({ message: 'ä¸»é¢˜ä¸å­˜åœ¨' });
    }

    if (isPinned) {
      await Topic.updateMany(
        { section: topic.section, _id: { $ne: topic._id } },
        { $set: { isPinned: false, pinnedAt: null } }
      );

      topic.isPinned = true;
      topic.pinnedAt = new Date();
    } else {
      topic.isPinned = false;
      topic.pinnedAt = null;
    }

    await topic.save();
    return res.json({ message: 'ok', topicId: topic._id, isPinned: topic.isPinned });
  } catch (error) {
    console.error('ç½®é¡¶æ“ä½œå¤±è´¥:', error);
    return res.status(500).json({ message: 'ç½®é¡¶æ“ä½œå¤±è´¥', error: error.message });
  }
});

module.exports = router;

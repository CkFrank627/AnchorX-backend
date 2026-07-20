const Notification = require('../models/Notification');
const User = require('../models/User');
const Work = require('../models/Work');
const Topic = require('../models/Topic');
const Reply = require('../models/Reply');

function ellipsize(value, maxLength = 20) {
  const text = value == null ? '' : String(value).trim();
  if (!text) {
    return '';
  }

  return text.length > maxLength
    ? `${text.slice(0, maxLength)}...`
    : text;
}

function extractRichTextSnippet(value, maxLength = 20) {
  if (typeof value === 'string') {
    return ellipsize(value, maxLength);
  }

  if (value && Array.isArray(value.ops)) {
    const plainText = value.ops
      .map((op) => (typeof op?.insert === 'string' ? op.insert : ''))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

    return ellipsize(plainText, maxLength);
  }

  if (value && typeof value.text === 'string') {
    return ellipsize(value.text, maxLength);
  }

  return '';
}

async function createCommentNotification({ workId, commentId, senderId }) {
  try {
    const work = await Work.findById(workId).select('author title');
    if (!work || String(work.author) === String(senderId)) {
      return null;
    }

    const sender = await User.findById(senderId).select('username');
    const senderName = sender?.username || 'æœªçŸ¥ç”¨æˆ·';

    return await Notification.create({
      recipient: work.author,
      type: 'comment',
      sender: senderId,
      comment: commentId,
      message: `${senderName} è¯„è®ºäº†ä½ çš„ä½œå“ "${work.title}"`,
    });
  } catch (error) {
    console.error('åˆ›å»ºè¯„è®ºé€šçŸ¥å¤±è´¥:', error.message);
    return null;
  }
}

async function createCommentLikeNotification({ commentAuthorId, commentId, senderId }) {
  if (String(commentAuthorId) === String(senderId)) {
    return null;
  }

  try {
    return await Notification.create({
      recipient: commentAuthorId,
      type: 'like',
      sender: senderId,
      likedComment: commentId,
      message: 'ç‚¹èµžäº†ä½ çš„è¯„è®º',
    });
  } catch (error) {
    console.error('åˆ›å»ºè¯„è®ºç‚¹èµžé€šçŸ¥å¤±è´¥:', error.message);
    return null;
  }
}

async function createTopicReplyNotifications({
  topicId,
  replyId,
  senderId,
  parentReplyAuthorId = null,
  replyContent,
}) {
  try {
    const topic = await Topic.findById(topicId).select('author title');
    if (!topic) {
      return [];
    }

    const notifications = [];
    const topicTitle = ellipsize(topic.title || 'æŸä¸»é¢˜');
    const replySnippet = extractRichTextSnippet(replyContent, 20);

    if (String(topic.author) !== String(senderId)) {
      notifications.push({
        recipient: topic.author,
        type: 'comment',
        sender: senderId,
        comment: replyId,
        topic: topic._id,
        message: `åœ¨ä½ çš„ä¸»é¢˜ã€Š${topicTitle}ã€‹ä¸­å‘è¡¨è¯„è®º`,
      });
    }

    if (
      parentReplyAuthorId
      && String(parentReplyAuthorId) !== String(senderId)
      && String(parentReplyAuthorId) !== String(topic.author)
    ) {
      notifications.push({
        recipient: parentReplyAuthorId,
        type: 'comment',
        sender: senderId,
        comment: replyId,
        topic: topic._id,
        message: replySnippet
          ? `åœ¨ä¸»é¢˜ã€Š${topicTitle}ã€‹ä¸­å›žå¤äº†ä½ çš„è¯„è®º: ${replySnippet}`
          : `åœ¨ä¸»é¢˜ã€Š${topicTitle}ã€‹ä¸­å›žå¤äº†ä½ çš„è¯„è®º`,
      });
    }

    if (!notifications.length) {
      return [];
    }

    return await Notification.insertMany(notifications, { ordered: false });
  } catch (error) {
    console.error('åˆ›å»ºä¸»é¢˜å›žå¤é€šçŸ¥å¤±è´¥:', error.message);
    return [];
  }
}

async function createTopicLikeNotification({ topicId, senderId }) {
  try {
    const topic = await Topic.findById(topicId).select('author title');
    if (!topic || String(topic.author) === String(senderId)) {
      return null;
    }

    return await Notification.create({
      recipient: topic.author,
      type: 'like',
      sender: senderId,
      likedWork: topic._id,
      topic: topic._id,
      message: `ç‚¹èµžäº†ä½ çš„ä¸»é¢˜: ${ellipsize(topic.title || 'æŸä¸»é¢˜')}`,
    });
  } catch (error) {
    console.error('åˆ›å»ºä¸»é¢˜ç‚¹èµžé€šçŸ¥å¤±è´¥:', error.message);
    return null;
  }
}

async function createTopicReplyLikeNotification({ replyId, senderId }) {
  try {
    const reply = await Reply.findById(replyId).select('author topic');
    if (!reply || String(reply.author) === String(senderId)) {
      return null;
    }

    const topic = await Topic.findById(reply.topic).select('title');
    const topicTitle = ellipsize(topic?.title || 'æŸä¸»é¢˜');

    return await Notification.create({
      recipient: reply.author,
      type: 'like',
      sender: senderId,
      likedComment: reply._id,
      topic: reply.topic,
      message: `ç‚¹èµžäº†ä½ åœ¨ä¸»é¢˜ã€Š${topicTitle}ã€‹ä¸­çš„è¯„è®º`,
    });
  } catch (error) {
    console.error('åˆ›å»ºä¸»é¢˜å›žå¤ç‚¹èµžé€šçŸ¥å¤±è´¥:', error.message);
    return null;
  }
}

module.exports = {
  createCommentLikeNotification,
  createCommentNotification,
  createTopicLikeNotification,
  createTopicReplyLikeNotification,
  createTopicReplyNotifications,
};

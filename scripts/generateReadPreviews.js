require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Work = require('./models/Work');

// === 1. 连接 MongoDB ===
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const OUTPUT_DIR = path.join(__dirname, 'public', 'read-previews');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// === 2. 生成单个作品的 HTML 模板 ===
function generateHTML(work) {
  // 提取第一页文字内容
  let firstText = '';
  if (Array.isArray(work.content) && work.content.length > 0) {
    const firstPage = work.content[0];
    if (firstPage?.content?.ops) {
      firstText = firstPage.content.ops
        .map(op => typeof op.insert === 'string' ? op.insert : '')
        .join('')
        .replace(/[\n\r]+/g, ' ')
        .trim()
        .slice(0, 200);
    } else if (typeof firstPage.content === 'string') {
      firstText = firstPage.content.slice(0, 200);
    }
  }

  const title = work.title || '无标题作品';
  const author = work.author?.username || '匿名作者';
  const date = new Date(work.updatedAt).toISOString().split('T')[0];
  const cover = work.coverImage || 'https://zhidianworld.com/default-cover.jpg';
  const desc = firstText || '点击展开阅读全文';
  const id = work._id.toString();

  // === HTML 模板 ===
  return `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - 质点安科站</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${cover}">
<meta property="og:url" content="https://zhidianworld.com/read/${id}">
<style>
body { font-family: Arial, sans-serif; background: #f9f9f9; margin: 0; padding: 0; }
.book-container { background: #fff; padding: 30px; border-radius: 8px; max-width: 800px; margin: 30px auto; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.book-header h1 { font-size: 2rem; color: #222; margin-bottom: 8px; }
.book-header p { font-size: 0.9rem; color: #666; }
.book-content { position: relative; line-height: 1.8; font-size: 1.05rem; color: #333; overflow: hidden; max-height: 400px; }
.read-more-overlay {
  position: absolute; bottom: 0; left: 0; right: 0; height: 80px;
  background: linear-gradient(to top, rgba(255,255,255,0.9), rgba(255,255,255,0));
  display: flex; align-items: center; justify-content: center;
  font-weight: bold; color: #0077cc; cursor: pointer;
  border-radius: 0 0 8px 8px; transition: background 0.3s;
}
.read-more-overlay:hover { background: linear-gradient(to top, rgba(240,240,240,0.95), rgba(255,255,255,0)); }
.cover { width: 100%; max-height: 300px; object-fit: cover; border-radius: 6px; margin-bottom: 20px; }
</style>
</head>
<body>
<div class="book-container">
  <div class="book-header">
    <img class="cover" src="${cover}" alt="封面图">
    <h1>${title}</h1>
    <p>作者：${author}｜更新时间：${date}</p>
  </div>
  <div class="book-content">
    <p>${firstText || '暂无内容'}</p>
    <div class="read-more-overlay" onclick="window.location.href='https://zhidianworld.com/read/?id=${id}'">点击展开全文</div>
  </div>
</div>
</body>
</html>`;
}

// === 3. 主逻辑 ===
(async () => {
  try {
    const works = await Work.find({ isPublished: true }).populate('author', 'username');
    console.log(`🔍 共找到 ${works.length} 个已发布作品`);

    for (const work of works) {
      const html = generateHTML(work);
      const filePath = path.join(OUTPUT_DIR, `${work._id}.html`);
      fs.writeFileSync(filePath, html, 'utf8');
      console.log(`✅ 已生成: ${filePath}`);
    }

    console.log('🎉 所有预览页已生成完成');
  } catch (err) {
    console.error('❌ 生成出错:', err);
  } finally {
    await mongoose.disconnect();
  }
})();

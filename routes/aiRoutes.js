const express = require('express');
const https = require('https');

const auth = require('../authMiddleware');

const router = express.Router();
const lastGenerationByUser = new Map();
const GENERATION_COOLDOWN_MS = 8000;
const MAX_PROMPT_LENGTH = 1200;
const MAX_CURRENT_CODE_LENGTH = 16000;
const MAX_GENERATED_CODE_LENGTH = 24000;

function requestDeepSeek(payload, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request({
      hostname: 'api.deepseek.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 45000,
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
        if (responseBody.length > 2 * 1024 * 1024) {
          request.destroy(new Error('DeepSeek 响应过大'));
        }
      });
      response.on('end', () => {
        let data = {};
        try {
          data = responseBody ? JSON.parse(responseBody) : {};
        } catch (error) {
          return reject(new Error('DeepSeek 返回了无法解析的数据'));
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const providerMessage = data.error && data.error.message;
          return reject(new Error(providerMessage || `DeepSeek 请求失败（${response.statusCode}）`));
        }
        return resolve(data);
      });
    });

    request.on('timeout', () => request.destroy(new Error('DeepSeek 请求超时')));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function parseGeneratedEffect(rawContent) {
  const normalized = String(rawContent || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  let result;
  try {
    result = JSON.parse(normalized);
  } catch (error) {
    throw new Error('AI 没有返回有效的特效 JSON，请重试');
  }

  const name = typeof result.name === 'string' ? result.name.trim().slice(0, 80) : '';
  const key = typeof result.key === 'string' ? result.key.trim().slice(0, 80) : '';
  const code = typeof result.code === 'string' ? result.code.trim() : '';
  const notes = typeof result.notes === 'string' ? result.notes.trim().slice(0, 500) : '';

  if (!name || !key || !code) throw new Error('AI 返回的名称、key 或代码不完整');
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) throw new Error('AI 返回了无效的特效 key');
  if (code.length > MAX_GENERATED_CODE_LENGTH) throw new Error('AI 生成的代码过长');
  if (!/function\s+applyEffect\s*\(\s*targetEl\s*\)/.test(code)) {
    throw new Error('AI 代码没有实现 applyEffect(targetEl)');
  }
  if (code.indexOf('&&') !== -1) throw new Error('AI 代码包含当前浏览器转换器不兼容的语法，请重试');

  const forbidden = /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document\.cookie|window\.location|\beval\s*\(|\bFunction\s*\(/;
  if (forbidden.test(code)) throw new Error('AI 代码包含不允许的网络、存储或动态执行操作');

  try {
    new Function(`"use strict";\n${code}\nreturn typeof applyEffect;`);
  } catch (error) {
    throw new Error(`AI 生成的代码无法编译：${error.message}`);
  }

  return { name, key, code, notes };
}

router.post('/effect-code', auth, async (req, res) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ message: '服务器尚未配置 DEEPSEEK_API_KEY' });
  }

  const prompt = typeof req.body.prompt === 'string' ? req.body.prompt.trim() : '';
  const currentCode = typeof req.body.currentCode === 'string'
    ? req.body.currentCode.slice(0, MAX_CURRENT_CODE_LENGTH)
    : '';
  if (!prompt) return res.status(400).json({ message: '请输入想生成的特效描述' });
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({ message: `特效描述不能超过 ${MAX_PROMPT_LENGTH} 个字符` });
  }

  const userId = String(req.userData.userId);
  const now = Date.now();
  const lastGeneration = lastGenerationByUser.get(userId) || 0;
  const waitMs = GENERATION_COOLDOWN_MS - (now - lastGeneration);
  if (waitMs > 0) {
    return res.status(429).json({ message: `请等待 ${Math.ceil(waitMs / 1000)} 秒后再生成` });
  }
  lastGenerationByUser.set(userId, now);

  const systemPrompt = [
    '你是网页文字动效代码生成器。只返回一个 JSON 对象，不要 Markdown。',
    'JSON 必须包含 name、key、code、notes 四个字符串字段。',
    'code 必须定义 function applyEffect(targetEl)，targetEl 是当前句子的 DOM 元素。',
    '效果应只操作 targetEl 及其子节点；可以使用 CSS style、Web Animations API、setTimeout 和 requestAnimationFrame。',
    '每次执行必须避免重复绑定，并在合理时间内清理临时节点、计时器和样式。',
    '禁止网络请求、Cookie、localStorage、sessionStorage、eval、Function、页面跳转和外部资源。',
    '不要使用 && 运算符；请用嵌套 if 或三元表达式表达相同逻辑。',
    'key 使用英文字母开头，之后只能包含英文字母、数字、下划线或连字符。',
    '代码不需要 script 标签，也不要自动保存。'
  ].join('\n');

  const userPrompt = currentCode
    ? `用户需求：${prompt}\n\n可参考或改写的当前代码：\n${currentCode}`
    : `用户需求：${prompt}`;

  try {
    const completion = await requestDeepSeek({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.45,
      max_tokens: 3200,
      stream: false,
    }, apiKey);

    const choice = Array.isArray(completion.choices) ? completion.choices[0] : null;
    const content = choice && choice.message ? choice.message.content : '';
    const effect = parseGeneratedEffect(content);
    return res.json({ ok: true, effect });
  } catch (error) {
    console.error('DeepSeek 特效生成失败:', error.message);
    return res.status(502).json({ message: error.message || 'AI 特效生成失败' });
  }
});

module.exports = router;

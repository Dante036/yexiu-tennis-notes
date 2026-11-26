import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt();
const escape = md.utils.escapeHtml;
const read = file => fs.readFileSync(file, 'utf8');
const encode = file => file.split('/').map(encodeURIComponent).join('/');

// Parse stage, episode badge, and tags from README.md
const metaByFile = new Map();
let currentStage = '';
for (const line of read('README.md').split('\n')) {
  const stageMatch = line.match(/^###\s+(.+)$/);
  if (stageMatch) {
    currentStage = stageMatch[1].trim();
    continue;
  }
  const itemMatch = line.match(/^- \*\*([^｜*]+)｜[^*]+\*\* — \[[^\]]+\]\((lessons\/[^)]+\.md)\)(?: · 标签：(.+))?$/);
  if (itemMatch) {
    const [, ep, file, tags = ''] = itemMatch;
    if (!metaByFile.has(file)) {
      metaByFile.set(file, { ep: ep.trim(), stage: currentStage, tags: tags.trim() });
    }
  }
}

const groups = [];
for (const token of md.parse(read('SUMMARY.md'), {})) {
  if (token.type !== 'inline') continue;
  const link = token.children.find(child => child.type === 'link_open');
  if (!link) {
    if (token.content !== '目录') groups.push({ title: token.content, pages: [] });
    continue;
  }
  const file = decodeURIComponent(link.attrGet('href'));
  if (!file.startsWith('lessons/')) continue;
  const title = token.children.filter(child => child.type === 'text').map(child => child.content).join('');
  const meta = metaByFile.get(file) ?? { ep: '', stage: '', tags: '' };
  groups.at(-1).pages.push({ file, title, url: file.replace(/\.md$/, '.html'), source: read(file), ...meta });
}
const pages = groups.flatMap(group => group.pages);
const byFile = new Map(pages.map(page => [page.file, page]));
const lessonFiles = fs.readdirSync('lessons').filter(file => file.endsWith('.md'));
if (byFile.size !== pages.length || pages.length !== lessonFiles.length) {
  throw new Error('SUMMARY.md must list every lesson exactly once');
}

function localTarget(href, file) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(href)));
}

const images = new Set();
function renderLesson(page) {
  const tokens = md.parse(page.source, {});
  const toc = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'heading_open' && token.tag === 'h2') {
      const text = tokens[i + 1]?.content?.trim();
      if (text) {
        const id = `sec-${toc.length}`;
        token.attrSet('id', id);
        toc.push({ id, text });
      }
    }
    for (const child of token.children ?? []) {
      if (child.type === 'link_open') {
        const href = child.attrGet('href');
        if (/^(https?:|#)/.test(href)) continue;
        const target = localTarget(href, page.file);
        const linked = byFile.get(target);
        if (!linked && target !== 'README.md') throw new Error('Unknown link ' + href);
        child.attrSet('href', linked ? '../' + encode(linked.url) : '../');
      }
      if (child.type === 'image') {
        const target = localTarget(child.attrGet('src'), page.file);
        if (!target.startsWith('.gitbook/assets/') || !fs.statSync(target).isFile()) {
          throw new Error('Invalid image ' + target);
        }
        const publicPath = target.replace(/^\.gitbook\/assets\//, 'images/');
        images.add(target);
        child.attrSet('src', '../' + encode(publicPath));
        child.attrSet('loading', 'lazy');
        child.attrSet('decoding', 'async');
      }
    }
  }
  const firstHeading = tokens.findIndex(token => token.type === 'heading_open' && token.tag === 'h1');
  if (firstHeading >= 0) tokens.splice(firstHeading, 3);
  const tocHtml = toc.length > 1
    ? `<nav class="toc" aria-label="本课目录">${toc.map(item => `<a href="#${item.id}">${escape(item.text)}</a>`).join('')}</nav>`
    : '';
  return tocHtml + md.renderer.render(tokens, md.options, {});
}

function write(file, content) {
  const target = path.join('dist', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function layout(title, prefix, body) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<link rel="stylesheet" href="${prefix}site.css">
<script defer src="${prefix}site.js"></script>
</head>
<body>
<header class="masthead"><div class="shell"><a href="${prefix || './'}">叶修网球课程笔记</a></div></header>
${body}
<dialog id="image-viewer" aria-label="动作图"><div class="viewer-bar"><a id="original" target="_blank" rel="noopener">打开原图</a><form method="dialog"><button aria-label="关闭图片" title="关闭图片">×</button></form></div><img id="enlarged" alt=""></dialog>
</body>
</html>`;
}

const starterFiles = [
  'lessons/正手篇.md',
  'lessons/反手篇.md',
  'lessons/发球篇.md',
  'lessons/小臂内旋篇.md',
  'lessons/正反手胸椎随挥篇.md',
  'lessons/“掉拍头”.md',
];
const starterHtml = starterFiles
  .map(f => byFile.get(f))
  .filter(Boolean)
  .map(p => `<a href="${encode(p.url)}">${escape(p.title)}</a>`)
  .join('<span class="arrow" aria-hidden="true">→</span>');

const sections = groups.map((group, i) => `
<section class="category" id="category-${i}">
<h2>${escape(group.title)}</h2>
<ul class="course-list">${group.pages.map(page => {
  const badge = page.ep ? `<span class="ep">${escape(page.ep)}</span>` : '';
  const metaParts = [page.stage, page.tags].filter(Boolean).join(' · ');
  const metaHtml = metaParts ? `<span class="course-meta">${escape(metaParts)}</span>` : '';
  return `<li><a href="${encode(page.url)}"><span class="course-title">${badge}${escape(page.title)}</span>${metaHtml}</a></li>`;
}).join('')}</ul>
</section>`).join('');

fs.rmSync('dist', { recursive: true, force: true });
write('index.html', layout('叶修网球课程笔记', '', `
<main class="shell home">
<h1>叶修网球课程笔记</h1>
<p class="intro">${pages.length} 篇课程 · ${groups.length} 个分类</p>
<label class="sr-only" for="search">搜索课程</label>
<input id="search" type="search" placeholder="搜索课程、动作或关键词" autocomplete="off">
<p id="search-status" role="status" hidden></p>
<nav class="starter" aria-label="新手推荐顺序"><strong>新手推荐：</strong>${starterHtml}</nav>
<nav class="categories" aria-label="技术分类">${groups.map((group, i) => `<a href="#category-${i}">${escape(group.title)}</a>`).join('')}</nav>
${sections}
</main>`));

for (const [index, page] of pages.entries()) {
  const previous = pages[index - 1];
  const next = pages[index + 1];
  write(page.url, layout(page.title + ' · 叶修网球课程笔记', '../', `
<main class="shell reading"><a class="back" href="../">← 返回课程目录</a>
<article><h1>${escape(page.title)}</h1>${renderLesson(page)}</article>
<nav class="pagination" aria-label="课程翻页">
${previous ? `<a rel="prev" href="../${encode(previous.url)}">上一篇 · ${escape(previous.title)}</a>` : '<span></span>'}
${next ? `<a rel="next" href="../${encode(next.url)}">下一篇 · ${escape(next.title)}</a>` : ''}
</nav></main>`));
}

for (const source of images) {
  const target = path.join('dist/images', source.slice('.gitbook/assets/'.length));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
for (const name of ['site.css', 'site.js']) fs.copyFileSync('site/' + name, 'dist/' + name);
write('search.json', JSON.stringify(pages.map(page => [encode(page.url), page.source.replace(/^!\[.*$/gm, '')])));
write('.nojekyll', '');
console.log(`Built ${pages.length} lessons with ${images.size} images`);

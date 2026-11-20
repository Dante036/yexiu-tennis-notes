const search = document.querySelector('#search');
if (search) {
  const groups = [...document.querySelectorAll('.category')];
  const navigation = document.querySelector('.categories');
  const status = document.querySelector('#search-status');
  const links = groups.flatMap(group => [...group.querySelectorAll('.course-list a')]);
  const normalize = value => value.normalize('NFKC').toLowerCase();
  let bodyByUrl;

  function filter() {
    const terms = normalize(search.value).trim().split(/\s+/).filter(Boolean);
    let matches = 0;
    for (const link of links) {
      const title = normalize(link.textContent);
      const body = bodyByUrl?.get(link.href) || '';
      const visible = terms.every(term => title.includes(term) || body.includes(term));
      link.parentElement.hidden = !visible;
      if (visible) matches++;
    }
    for (const group of groups) group.hidden = !group.querySelector('li:not([hidden])');
    navigation.hidden = terms.length > 0;
    status.hidden = terms.length === 0;
    status.textContent = matches ? `找到 ${matches} 篇课程` : '未找到课程';
  }

  search.addEventListener('input', filter);
  fetch('search.json').then(response => {
    if (!response.ok) throw new Error('Search index unavailable');
    return response.json();
  }).then(entries => {
    bodyByUrl = new Map(entries.map(([url, body]) => [new URL(url, location.href).href, normalize(body)]));
    filter();
  }).catch(() => {
    search.placeholder = '搜索课名';
  });
}

const viewer = document.querySelector('#image-viewer');
const enlarged = document.querySelector('#enlarged');
const original = document.querySelector('#original');
for (const image of document.querySelectorAll('article img')) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'image-trigger';
  button.setAttribute('aria-label', `放大图片 ${image.alt}`.trim());
  image.replaceWith(button);
  button.append(image);
  button.addEventListener('click', () => {
    enlarged.src = image.currentSrc || image.src;
    enlarged.alt = image.alt;
    original.href = enlarged.src;
    viewer.showModal();
  });
}

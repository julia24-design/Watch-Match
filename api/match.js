const BASE = 'https://letterboxd.com';
const MAX_PAGES = 60;
const PAGE_DELAY_MS = 120;

function cleanUsername(input = '') {
  let s = String(input).trim();
  if (!s) return null;
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      if (!/(^|\.)letterboxd\.com$/i.test(u.hostname)) return null;
      s = u.pathname.split('/').filter(Boolean)[0] || '';
    }
  } catch (_) {}
  s = s.replace(/^@/, '').split('/')[0].trim();
  return /^[A-Za-z0-9_\-]+$/.test(s) ? s : null;
}

function decodeEntities(s = '') {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function absolutePoster(src) {
  if (!src) return '';
  src = decodeEntities(src);
  if (src.startsWith('//')) return `https:${src}`;
  if (src.startsWith('/')) return `${BASE}${src}`;
  return src;
}

function pickPoster(block) {
  const srcset = block.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
  if (srcset) {
    const candidates = decodeEntities(srcset).split(',').map(x => x.trim().split(/\s+/)[0]).filter(Boolean);
    if (candidates.length) return absolutePoster(candidates[candidates.length - 1]);
  }
  const src = block.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
  return absolutePoster(src || '');
}

function parseFilms(html) {
  const found = new Map();
  const blocks = html.match(/<li\b[^>]*class=["'][^"']*poster-container[^"']*["'][\s\S]*?<\/li>/gi) || [];

  for (const block of blocks) {
    let slug = block.match(/href=["']\/film\/([^\/?#"']+)\/?["']/i)?.[1];
    if (!slug) slug = block.match(/data-(?:film-slug|item-slug)=["']([^"']+)["']/i)?.[1];
    if (!slug) {
      const target = block.match(/data-target-link=["']([^"']+)["']/i)?.[1] || '';
      slug = target.match(/\/film\/([^\/?#]+)/i)?.[1];
    }
    if (!slug) continue;

    const imgAlt = block.match(/<img\b[^>]*\balt=["']([^"']*)["']/i)?.[1];
    const frameTitle = block.match(/<a\b[^>]*class=["'][^"']*frame[^"']*["'][^>]*title=["']([^"']+)["']/i)?.[1]
      || block.match(/<a\b[^>]*title=["']([^"']+)["'][^>]*class=["'][^"']*frame[^"']*["']/i)?.[1];
    const dataName = block.match(/data-(?:item-name|film-name)=["']([^"']+)["']/i)?.[1];
    const rawTitle = decodeEntities(imgAlt || frameTitle || dataName || slug.replace(/-/g, ' ')).trim();
    const yearSource = decodeEntities(frameTitle || rawTitle);
    const yearMatch = yearSource.match(/\((\d{4})\)\s*$/);
    const year = yearMatch?.[1] || '';
    const title = rawTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim();
    found.set(slug, {
      slug,
      title,
      year,
      poster: pickPoster(block),
      url: `${BASE}/film/${slug}/`
    });
  }

  // Markup fallback: newer layouts may not use li.poster-container.
  if (found.size === 0) {
    const tags = html.match(/<[^>]+(?:data-film-slug|data-item-slug|data-target-link)[^>]*>/gi) || [];
    for (const tag of tags) {
      let slug = tag.match(/data-(?:film-slug|item-slug)=["']([^"']+)["']/i)?.[1];
      if (!slug) {
        const target = tag.match(/data-target-link=["']([^"']+)["']/i)?.[1] || '';
        slug = target.match(/\/film\/([^\/?#]+)/i)?.[1];
      }
      if (!slug) continue;
      const name = decodeEntities(tag.match(/data-(?:item-name|film-name)=["']([^"']+)["']/i)?.[1] || slug.replace(/-/g, ' '));
      found.set(slug, { slug, title: name, year: '', poster: '', url: `${BASE}/film/${slug}/` });
    }
  }

  return [...found.values()];
}

function hasNextPage(html) {
  return /class=["'][^"']*paginate-next[^"']*["']/i.test(html);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchPage(username, page) {
  const url = page === 1
    ? `${BASE}/${encodeURIComponent(username)}/watchlist/`
    : `${BASE}/${encodeURIComponent(username)}/watchlist/page/${page}/`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; WatchMatch/0.1; personal watchlist comparison)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache'
    },
    redirect: 'follow'
  });

  const text = await response.text();
  if (!response.ok) {
    const cloudflare = response.status === 403 || response.status === 429 || /cloudflare|just a moment|cf-chl/i.test(text);
    const err = new Error(cloudflare
      ? `Letterboxd blocked the server request for @${username} (${response.status}). This is the Vercel/Cloudflare issue we were testing for.`
      : `Could not read @${username}'s watchlist (Letterboxd returned ${response.status}).`);
    err.statusCode = response.status === 404 ? 404 : 502;
    throw err;
  }

  if (/just a moment|cf-chl|attention required/i.test(text)) {
    const err = new Error(`Letterboxd's anti-bot page intercepted the request for @${username}.`);
    err.statusCode = 502;
    throw err;
  }
  return text;
}

async function fetchWatchlist(username) {
  const all = new Map();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchPage(username, page);
    const films = parseFilms(html);
    films.forEach(f => all.set(f.slug, f));

    if (page === 1 && films.length === 0) {
      const privateOrEmpty = /wants to see\s+0\s+films/i.test(html) || /private/i.test(html);
      if (!privateOrEmpty && !/watchlist/i.test(html)) {
        const err = new Error(`I reached Letterboxd for @${username}, but couldn't recognize the watchlist page. Letterboxd may have changed its HTML.`);
        err.statusCode = 502;
        throw err;
      }
    }

    if (!hasNextPage(html) || films.length === 0) break;
    await sleep(PAGE_DELAY_MS);
  }
  return all;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });
  const user1 = cleanUsername(req.query.user1);
  const user2 = cleanUsername(req.query.user2);
  if (!user1 || !user2) return res.status(400).json({ error: 'Enter two valid Letterboxd usernames or Letterboxd profile/watchlist URLs.' });
  if (user1.toLowerCase() === user2.toLowerCase()) return res.status(400).json({ error: 'Use two different Letterboxd accounts.' });

  try {
    const [a, b] = await Promise.all([fetchWatchlist(user1), fetchWatchlist(user2)]);
    const [small, other] = a.size <= b.size ? [a, b] : [b, a];
    const matches = [];
    for (const [slug, film] of small) {
      const otherFilm = other.get(slug);
      if (otherFilm) {
        matches.push({
          ...film,
          title: film.title || otherFilm.title,
          year: film.year || otherFilm.year,
          poster: film.poster || otherFilm.poster
        });
      }
    }
    matches.sort((x, y) => x.title.localeCompare(y.title));
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    return res.status(200).json({ users: [user1, user2], counts: [a.size, b.size], matches });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message || 'Unexpected error.' });
  }
};

module.exports._test = { cleanUsername, parseFilms, hasNextPage };

const LETTERBOXD = 'https://letterboxd.com';
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; WatchMatch/2.0; personal project)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9'
};

const MODES = {
  watchlist: { path: 'watchlist', label: 'Watchlist' },
  watched: { path: 'films', label: 'Watched films' },
  liked: { path: 'likes/films', label: 'Liked films' }
};

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeUsername(value) {
  let input = String(first(value) || '').trim();
  if (!input) return '';
  try {
    if (/^https?:\/\//i.test(input)) {
      const parsed = new URL(input);
      if (!/(^|\.)letterboxd\.com$/i.test(parsed.hostname)) return '';
      input = parsed.pathname.split('/').filter(Boolean)[0] || '';
    }
  } catch {
    return '';
  }
  input = input.replace(/^@/, '').split(/[/?#]/)[0].trim();
  return /^[a-z0-9_-]{1,40}$/i.test(input) ? input.toLowerCase() : '';
}

function decodeHtml(value = '') {
  return value
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}=(?:\"([^\"]*)\"|'([^']*)')`, 'i'));
  return decodeHtml(match?.[1] ?? match?.[2] ?? '');
}

function posterFromTag(tag, slug) {
  const identifier = attribute(tag, 'data-postered-identifier');
  const id = identifier.match(/film:(\d+)/i)?.[1];
  if (!id) return '';
  const digits = id.split('').join('/');
  return `https://a.ltrbxd.com/resized/film-poster/${digits}/${id}-${slug}-0-600-0-900-crop.jpg`;
}

export function parseFilms(html) {
  const gridStart = html.indexOf('<div class="poster-grid"');
  if (gridStart < 0) return [];
  const pageEnd = html.indexOf('<div class="pagination"', gridStart);
  const scope = html.slice(gridStart, pageEnd > gridStart ? pageEnd : undefined);
  const tags = scope.match(/<div\b[^>]*data-component-class=(?:\"LazyPoster\"|'LazyPoster')[^>]*>/gi) || [];
  const seen = new Set();
  const films = [];

  for (const tag of tags) {
    const slug = attribute(tag, 'data-item-slug');
    if (!slug || seen.has(slug)) continue;
    const fullName = attribute(tag, 'data-item-full-display-name');
    const itemName = attribute(tag, 'data-item-name');
    const title = fullName || itemName || slug.replace(/-/g, ' ');
    const yearMatch = title.match(/\((\d{4})\)$/);
    seen.add(slug);
    films.push({
      slug,
      title,
      year: yearMatch?.[1] || '',
      poster: posterFromTag(tag, slug),
      url: `${LETTERBOXD}/film/${slug}/`
    });
  }
  return films;
}

export function maxPage(html) {
  let maximum = 1;
  for (const match of html.matchAll(/\/page\/(\d+)\//g)) {
    maximum = Math.max(maximum, Number(match[1]));
  }
  return Math.min(maximum, 100);
}

function isChallenge(html, status) {
  return status === 403 ||
    /<title>Just a moment\.\.\.<\/title>|cf-chl-|Enable JavaScript and cookies to continue/i.test(html);
}

function pageLooksRelevant(html, mode) {
  if (mode === 'watchlist') {
    return /js-watchlist-count|(?:’|&#39;|')s Watchlist|wants to see/i.test(html);
  }
  if (mode === 'watched') {
    return /films-watched|>\s*Watched\s*</i.test(html);
  }
  return /films-liked|Liked films|Likes[^<]{0,80}films|(?:’|&#39;|')s liked films/i.test(html);
}

function privateMessage(html, mode) {
  const name = MODES[mode].label.toLowerCase();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return new RegExp(`${name}[^.]{0,100}private|private[^.]{0,100}${name}`, 'i').test(decodeHtml(text));
}

async function fetchHtml(url, attempts = 2) {
  let lastResult;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        headers: REQUEST_HEADERS,
        redirect: 'follow',
        signal: controller.signal
      });
      const html = await response.text();
      lastResult = { status: response.status, html, finalUrl: response.url };
      if (![403, 429, 500, 502, 503, 504].includes(response.status)) return lastResult;
    } catch (error) {
      lastResult = { status: 0, html: '', finalUrl: url, error };
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 650));
  }
  return lastResult;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function fetchMemberFilms(username, mode) {
  const config = MODES[mode];
  const basePath = `/${username}/${config.path}/`;
  const firstUrl = `${LETTERBOXD}${basePath}`;
  const firstPage = await fetchHtml(firstUrl);

  if (firstPage.status === 404 || /Page Not Found|Member not found/i.test(firstPage.html)) {
    return { username, label: config.label, status: 'not_found', films: [] };
  }
  if (isChallenge(firstPage.html, firstPage.status) || firstPage.status === 429) {
    return { username, label: config.label, status: 'blocked', films: [] };
  }
  if (firstPage.status < 200 || firstPage.status >= 300) {
    return { username, label: config.label, status: 'unavailable', films: [] };
  }

  const expectedFragment = `/${username}/${config.path}/`;
  let finalPath = '';
  try { finalPath = new URL(firstPage.finalUrl).pathname; } catch {}
  const firstFilms = parseFilms(firstPage.html);

  if (!firstFilms.length && privateMessage(firstPage.html, mode)) {
    return { username, label: config.label, status: 'private', films: [] };
  }
  if (!finalPath.startsWith(expectedFragment) || (!firstFilms.length && !pageLooksRelevant(firstPage.html, mode))) {
    return { username, label: config.label, status: 'unavailable', films: [] };
  }

  const pages = maxPage(firstPage.html);
  const remainingPageNumbers = Array.from({ length: pages - 1 }, (_, index) => index + 2);
  let remaining = await mapWithConcurrency(remainingPageNumbers, 2, async pageNumber => {
    const result = await fetchHtml(`${LETTERBOXD}${basePath}page/${pageNumber}/`);
    return {
      pageNumber,
      ok: result.status === 200 && !isChallenge(result.html, result.status),
      blocked: isChallenge(result.html, result.status) || result.status === 429,
      films: result.status === 200 ? parseFilms(result.html) : []
    };
  });

  // Retry failed pages one at a time. Letterboxd occasionally challenges a
  // burst of paginated requests even when the first page succeeds.
  for (let index = 0; index < remaining.length; index += 1) {
    if (remaining[index].ok) continue;
    await new Promise(resolve => setTimeout(resolve, 500));
    const pageNumber = remaining[index].pageNumber;
    const retry = await fetchHtml(`${LETTERBOXD}${basePath}page/${pageNumber}/`, 1);
    remaining[index] = {
      pageNumber,
      ok: retry.status === 200 && !isChallenge(retry.html, retry.status),
      blocked: isChallenge(retry.html, retry.status) || retry.status === 429,
      films: retry.status === 200 ? parseFilms(retry.html) : []
    };
  }

  const failedPage = remaining.find(page => !page.ok);
  if (failedPage) {
    return {
      username,
      label: config.label,
      status: failedPage.blocked ? 'blocked' : 'unavailable',
      films: []
    };
  }

  const deduped = new Map();
  for (const film of [firstFilms, ...remaining.map(page => page.films)].flat()) deduped.set(film.slug, film);
  const films = [...deduped.values()];
  return {
    username,
    label: config.label,
    status: films.length ? 'public' : 'empty',
    films
  };
}

export function intersection(firstList, secondList) {
  const secondSlugs = new Set(secondList.map(film => film.slug));
  return firstList.filter(film => secondSlugs.has(film.slug));
}

export function extractPosterUrl(html) {
  const scripts = html.match(/<script[^>]*type=(?:\"application\/ld\+json\"|'application\/ld\+json')[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const match = script.match(/\"image\"\s*:\s*\"(https?:\\?\/\\?\/[^\"]+)\"/i);
    if (!match) continue;
    return match[1].replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
  }
  return '';
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

async function servePoster(slug, response) {
  if (!/^[a-z0-9-]{1,160}$/i.test(slug)) {
    response.statusCode = 400;
    response.end('Invalid film.');
    return;
  }
  const result = await fetchHtml(`${LETTERBOXD}/film/${slug}/`, 1);
  const poster = result.status === 200 ? extractPosterUrl(result.html) : '';
  if (!poster) {
    response.statusCode = 404;
    response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
    response.end('Poster unavailable.');
    return;
  }
  response.statusCode = 302;
  response.setHeader('Location', poster);
  response.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
  response.end();
}

function inaccessibleSource(sources) {
  return sources.find(source => ['private', 'not_found', 'unavailable', 'blocked'].includes(source.status));
}

function errorFor(source) {
  if (source.status === 'not_found') {
    return {
      title: `We couldn't find @${source.username}`,
      error: 'Double-check the Letterboxd username or profile URL and try again.'
    };
  }
  if (source.status === 'private') {
    return {
      title: `@${source.username}'s ${source.label.toLowerCase()} is private`,
      error: 'Letterboxd only lets WatchMatch read information that is public. They can make this section public in their Letterboxd privacy settings.'
    };
  }
  if (source.status === 'blocked') {
    return {
      title: 'Letterboxd paused this request',
      error: 'Letterboxd temporarily blocked the lookup. Wait a minute and try again.'
    };
  }
  return {
    title: `We couldn't access @${source.username}'s ${source.label.toLowerCase()}`,
    error: 'It may be private or temporarily unavailable. You can still try one of the other comparison tabs.'
  };
}

export default async function handler(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const posterSlug = url.searchParams.get('poster');
  if (posterSlug) {
    await servePoster(posterSlug, response);
    return;
  }

  const mode = url.searchParams.get('mode') || 'watchlist';
  if (!MODES[mode]) {
    sendJson(response, 400, { error: 'Unknown comparison type.' });
    return;
  }

  const user1 = normalizeUsername(url.searchParams.get('user1'));
  const user2 = normalizeUsername(url.searchParams.get('user2'));
  if (!user1 || !user2) {
    sendJson(response, 400, { error: 'Enter two valid Letterboxd usernames or profile URLs.' });
    return;
  }

  try {
    const sources = await Promise.all([
      fetchMemberFilms(user1, mode),
      fetchMemberFilms(user2, mode)
    ]);
    const inaccessible = inaccessibleSource(sources);
    if (inaccessible) {
      const friendly = errorFor(inaccessible);
      sendJson(response, 422, {
        ...friendly,
        users: [user1, user2],
        mode,
        sources: sources.map(({ films, ...source }) => source)
      });
      return;
    }

    const matches = intersection(sources[0].films, sources[1].films);
    response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600');
    sendJson(response, 200, {
      users: [user1, user2],
      mode,
      counts: sources.map(source => source.films.length),
      sources: sources.map(({ films, ...source }) => source),
      matches
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: 'WatchMatch hit an unexpected error while reading Letterboxd. Please try again in a moment.'
    });
  }
}

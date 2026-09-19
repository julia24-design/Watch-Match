const user1El = document.getElementById('user1');
const user2El = document.getElementById('user2');
const btn = document.getElementById('matchBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const gridEl = document.getElementById('movieGrid');
const countEl = document.getElementById('matchCount');
const matchLabelEl = document.getElementById('matchLabel');
const pairEl = document.getElementById('pairLabel');
const shuffleBtn = document.getElementById('shuffleBtn');
const tabs = [...document.querySelectorAll('.match-tab')];
const WATCHED_PAGE_DELAY_MS = 1400;
const WATCHED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WATCHED_FILM_LIMIT = 500;

const MODES = {
  watchlist: {
    label: 'movies you both want to watch',
    loading: 'Checking both watchlists…',
    emptyTitle: 'No shared watchlist movies yet',
    emptyBody: 'You may simply have different watchlists — which is arguably useful information.'
  },
  watched: {
    label: "movies you've both watched",
    loading: 'Comparing watched films…',
    emptyTitle: 'No watched films in common',
    emptyBody: 'These public profiles do not currently show any watched films in common.'
  },
  liked: {
    label: 'movies you both liked',
    loading: 'Comparing liked films…',
    emptyTitle: 'No liked films in common',
    emptyBody: 'These public profiles do not currently show any liked films in common.'
  }
};

let currentMovies = [];
let activeMode = 'watchlist';
let pairKey = '';
let cache = {};

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = `status${isError ? ' error' : ''}`;
}

function hideStatus() {
  statusEl.className = 'status hidden';
}

function normalizedPair() {
  return `${user1El.value.trim()}::${user2El.value.trim()}`;
}

function setActiveTab(mode) {
  activeMode = mode;
  tabs.forEach(tab => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
}

function messageCard(title, body, isError = false, action = null) {
  const wrap = document.createElement('div');
  wrap.className = `result-message${isError ? ' error' : ''}`;
  const inner = document.createElement('div');
  inner.innerHTML = `<div class="result-message-mark" aria-hidden="true">${isError ? '!' : '○'}</div>`;
  const heading = document.createElement('h3');
  heading.textContent = title;
  const copy = document.createElement('p');
  copy.textContent = body;
  inner.append(heading, copy);
  if (action) {
    const button = document.createElement('button');
    button.className = 'secondary-btn';
    button.style.marginTop = '18px';
    button.textContent = action.label;
    button.addEventListener('click', action.onClick);
    inner.appendChild(button);
  }
  wrap.appendChild(inner);
  return wrap;
}

function movieCard(movie, index) {
  const article = document.createElement('article');
  article.className = 'movie-card';
  article.dataset.index = index;

  const link = document.createElement('a');
  link.className = 'poster-link';
  link.href = movie.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = `Open ${movie.title} on Letterboxd`;

  const placeholder = document.createElement('div');
  placeholder.className = 'poster-placeholder';
  placeholder.textContent = movie.title;
  link.appendChild(placeholder);

  const img = document.createElement('img');
  img.src = movie.poster || `/api/match?poster=${encodeURIComponent(movie.slug)}`;
  img.alt = `${movie.title} poster`;
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('load', () => {
    img.classList.add('loaded');
    placeholder.remove();
  });
  let triedPosterProxy = false;
  img.addEventListener('error', () => {
    if (movie.poster && !triedPosterProxy) {
      triedPosterProxy = true;
      img.src = `/api/match?poster=${encodeURIComponent(movie.slug)}`;
      return;
    }
    img.remove();
    placeholder.className = 'poster-fallback';
  });
  link.appendChild(img);

  const title = document.createElement('div');
  title.className = 'movie-title';
  title.textContent = movie.title;
  title.title = movie.title;

  article.append(link, title);
  return article;
}

function prepareResults(users, mode) {
  const fallbackUsers = [user1El.value.trim(), user2El.value.trim()];
  const shownUsers = users || fallbackUsers;
  pairEl.textContent = `@${shownUsers[0]} × @${shownUsers[1]}`;
  matchLabelEl.textContent = MODES[mode].label;
  resultsEl.classList.remove('hidden');
}

function render(data, mode) {
  currentMovies = data.matches || [];
  prepareResults(data.users, mode);
  gridEl.innerHTML = '';
  countEl.textContent = currentMovies.length;
  shuffleBtn.classList.toggle('hidden', currentMovies.length === 0);

  if (!currentMovies.length) {
    const emptySource = (data.sources || []).find(source => source.status === 'empty');
    const title = emptySource
      ? `@${emptySource.username}'s ${emptySource.label.toLowerCase()} is empty`
      : MODES[mode].emptyTitle;
    const body = emptySource
      ? 'There is nothing public to compare in this category yet.'
      : MODES[mode].emptyBody;
    gridEl.appendChild(messageCard(title, body));
  } else {
    currentMovies.forEach((movie, index) => gridEl.appendChild(movieCard(movie, index)));
  }
  hideStatus();
}

function renderError(error, mode) {
  currentMovies = [];
  prepareResults(error.users, mode);
  countEl.textContent = error.resumable ? '—' : '0';
  shuffleBtn.classList.add('hidden');
  gridEl.innerHTML = '';
  const action = error.resumable ? {
    label: 'Resume loading',
    onClick: () => loadMode('watched', { force: true })
  } : null;
  gridEl.appendChild(messageCard(
    error.title || `We couldn't compare ${MODES[mode].label}`,
    error.message || 'The profile may be private, empty, unavailable, or the username may be incorrect.',
    true,
    action
  ));
  hideStatus();
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function watchedStorageKey(username) {
  return `watchmatch:watched:v3:${username.trim().toLowerCase()}`;
}

function readWatchedState(username) {
  try {
    const raw = localStorage.getItem(watchedStorageKey(username));
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state.savedAt || Date.now() - state.savedAt > WATCHED_CACHE_TTL_MS) {
      localStorage.removeItem(watchedStorageKey(username));
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function saveWatchedState(member) {
  try {
    localStorage.setItem(watchedStorageKey(member.input), JSON.stringify({
      username: member.username,
      pages: member.pages,
      totalPages: member.totalPages,
      truncated: member.truncated,
      complete: member.complete,
      savedAt: Date.now()
    }));
  } catch {
    // The comparison still works if private browsing blocks local storage.
  }
}

function watchedMember(input) {
  const saved = readWatchedState(input);
  return {
    input,
    username: saved?.username || input.trim().replace(/^@/, ''),
    pages: saved?.pages || {},
    totalPages: saved?.totalPages || null,
    truncated: Boolean(saved?.truncated),
    complete: Boolean(saved?.complete)
  };
}

function memberFilms(member) {
  const deduped = new Map();
  Object.keys(member.pages)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach(page => {
      for (const film of member.pages[page] || []) deduped.set(film.slug, film);
    });
  return [...deduped.values()].slice(0, WATCHED_FILM_LIMIT);
}

function nextWatchedPage(member) {
  if (member.complete) return null;
  const ceiling = member.totalPages || 1;
  for (let page = 1; page <= ceiling; page += 1) {
    if (!member.pages[page]) return page;
  }
  return null;
}

function updateWatchedProgress(members) {
  const loadedPages = members.reduce((sum, member) => sum + Object.keys(member.pages).length, 0);
  const totalPages = members.reduce((sum, member) => sum + (member.totalPages || 1), 0);
  const loadedFilms = members.reduce((sum, member) => sum + memberFilms(member).length, 0);
  gridEl.innerHTML = `
    <div class="loading-grid">
      <strong>Loading watched films…</strong><br>
      <span>${loadedPages} of ${totalPages} profile pages loaded · ${loadedFilms} films found</span><br>
      <small>Successful pages are saved, so this can resume if Letterboxd pauses.</small>
    </div>`;
}

async function requestWatchedPage(member, page) {
  const params = new URLSearchParams({
    mode: 'watched',
    user: member.input,
    page: String(page)
  });
  const response = await fetch(`/api/match?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.title = data.title;
    error.resumable = data.source?.status === 'blocked' || response.status >= 500;
    throw error;
  }
  member.username = data.username;
  member.pages[page] = data.films || [];
  member.totalPages = data.totalPages || 1;
  member.truncated = Boolean(data.truncated);
  member.complete = Object.keys(member.pages).length >= member.totalPages;
  saveWatchedState(member);
}

async function loadWatchedComparison(user1, user2) {
  const members = [watchedMember(user1), watchedMember(user2)];
  let madeRequest = false;
  updateWatchedProgress(members);

  while (members.some(member => !member.complete)) {
    let advanced = false;
    for (const member of members) {
      const page = nextWatchedPage(member);
      if (!page) {
        member.complete = true;
        saveWatchedState(member);
        continue;
      }
      if (madeRequest) await sleep(WATCHED_PAGE_DELAY_MS);
      await requestWatchedPage(member, page);
      madeRequest = true;
      advanced = true;
      updateWatchedProgress(members);
    }
    if (!advanced) break;
  }

  const lists = members.map(memberFilms);
  const secondSlugs = new Set(lists[1].map(film => film.slug));
  const matches = lists[0].filter(film => secondSlugs.has(film.slug));
  return {
    users: members.map(member => member.username),
    mode: 'watched',
    counts: lists.map(list => list.length),
    sources: members.map((member, index) => ({
      username: member.username,
      label: 'Watched films',
      status: lists[index].length ? 'public' : 'empty',
      truncated: member.truncated
    })),
    matches
  };
}

function showLoading(mode) {
  prepareResults(null, mode);
  countEl.textContent = '—';
  shuffleBtn.classList.add('hidden');
  gridEl.innerHTML = `<div class="loading-grid">${MODES[mode].loading}</div>`;
  hideStatus();
}

async function loadMode(mode, { force = false } = {}) {
  const user1 = user1El.value.trim();
  const user2 = user2El.value.trim();
  if (!user1 || !user2) {
    showStatus('Enter two Letterboxd usernames or URLs.', true);
    return;
  }

  const nextPairKey = normalizedPair();
  if (nextPairKey !== pairKey) {
    pairKey = nextPairKey;
    cache = {};
  }

  setActiveTab(mode);
  if (!force && cache[mode]) {
    cache[mode].error ? renderError(cache[mode].error, mode) : render(cache[mode].data, mode);
    return;
  }

  showLoading(mode);
  tabs.forEach(tab => { tab.disabled = true; });
  try {
    if (mode === 'watched') {
      const data = await loadWatchedComparison(user1, user2);
      cache[mode] = { data };
      render(data, mode);
      return;
    }
    const params = new URLSearchParams({ user1, user2, mode });
    const response = await fetch(`/api/match?${params.toString()}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = {
        title: data.title,
        message: data.error || `Request failed (${response.status}).`,
        users: data.users
      };
      cache[mode] = { error };
      renderError(error, mode);
      return;
    }
    cache[mode] = { data };
    render(data, mode);
  } catch (error) {
    const friendlyError = {
      title: error.title,
      message: error.message || 'Something went wrong.',
      users: [user1, user2],
      resumable: Boolean(error.resumable)
    };
    if (!friendlyError.resumable) cache[mode] = { error: friendlyError };
    renderError(friendlyError, mode);
  } finally {
    tabs.forEach(tab => { tab.disabled = false; });
  }
}

async function match() {
  btn.disabled = true;
  btn.innerHTML = 'Checking profiles…';
  cache = {};
  pairKey = '';
  try {
    await loadMode('watchlist', { force: true });
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Find our movies <span aria-hidden="true">→</span>';
  }
}

btn.addEventListener('click', match);
[user1El, user2El].forEach(input => input.addEventListener('keydown', event => {
  if (event.key === 'Enter') match();
}));

tabs.forEach(tab => tab.addEventListener('click', () => loadMode(tab.dataset.mode)));

shuffleBtn.addEventListener('click', () => {
  document.querySelectorAll('.movie-card').forEach(card => card.classList.remove('highlight'));
  if (!currentMovies.length) return;
  const index = Math.floor(Math.random() * currentMovies.length);
  const chosen = document.querySelector(`.movie-card[data-index="${index}"]`);
  chosen?.classList.add('highlight');
  chosen?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

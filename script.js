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

function messageCard(title, body, isError = false) {
  const wrap = document.createElement('div');
  wrap.className = `result-message${isError ? ' error' : ''}`;
  const inner = document.createElement('div');
  inner.innerHTML = `<div class="result-message-mark" aria-hidden="true">${isError ? '!' : '○'}</div>`;
  const heading = document.createElement('h3');
  heading.textContent = title;
  const copy = document.createElement('p');
  copy.textContent = body;
  inner.append(heading, copy);
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
  countEl.textContent = '0';
  shuffleBtn.classList.add('hidden');
  gridEl.innerHTML = '';
  gridEl.appendChild(messageCard(
    error.title || `We couldn't compare ${MODES[mode].label}`,
    error.message || 'The profile may be private, empty, unavailable, or the username may be incorrect.',
    true
  ));
  hideStatus();
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
    const friendlyError = { message: error.message || 'Something went wrong.' };
    cache[mode] = { error: friendlyError };
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

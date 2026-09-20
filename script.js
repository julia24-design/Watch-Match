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
const WATCHED_IMPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
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
    if (data.partial) {
      const exportName = data.mode === 'watchlist' ? 'watchlist.csv' : 'watched.csv';
      gridEl.appendChild(messageCard(
        'No shared films found in the loaded pages yet',
        `This is only a partial result. Upload both ${exportName} exports below to check the complete lists.`
      ));
      hideStatus();
      return;
    }
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

function renderCollectionPartial(data, mode) {
  render(data, mode);
  const isWatchlist = mode === 'watchlist';
  matchLabelEl.textContent = isWatchlist
    ? 'movies you both want to watch so far'
    : "movies you've both watched so far";
  showStatus(
    `Showing ${data.matches.length} confirmed ${data.matches.length === 1 ? 'match' : 'matches'} from the public profile pages Letterboxd allowed us to read. Larger ${isWatchlist ? 'watchlists' : 'watched histories'} require the optional exports below for complete results.`
  );
  statusEl.appendChild(collectionImportPanel(data.memberStates || [], mode));
}

function renderCollection(data, mode) {
  if (data.partial) {
    renderCollectionPartial(data, mode);
    return;
  }
  render(data, mode);
  const importedUsers = (data.memberStates || [])
    .filter(member => member.importedFilms)
    .map(member => `@${member.username}`);
  if (importedUsers.length) {
    const noun = mode === 'watchlist' ? 'watchlists' : 'watched histories';
    showStatus(`Complete ${noun} loaded locally for ${importedUsers.join(' and ')}. These files stay in this browser.`);
  }
}

function renderError(error, mode) {
  currentMovies = [];
  prepareResults(error.users, mode);
  countEl.textContent = error.resumable ? '—' : '0';
  shuffleBtn.classList.add('hidden');
  gridEl.innerHTML = '';
  gridEl.appendChild(messageCard(
    error.title || `We couldn't compare ${MODES[mode].label}`,
    error.message || 'The profile may be private, empty, unavailable, or the username may be incorrect.',
    true
  ));
  hideStatus();
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function watchedStorageKey(username) {
  return `watchmatch:watched:v3:${username.trim().toLowerCase()}`;
}

function watchedImportStorageKey(username) {
  return `watchmatch:watched-import:v1:${username.trim().replace(/^@/, '').toLowerCase()}`;
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

function readWatchedImport(username) {
  try {
    const raw = localStorage.getItem(watchedImportStorageKey(username));
    if (!raw) return null;
    const imported = JSON.parse(raw);
    if (!imported.savedAt || Date.now() - imported.savedAt > WATCHED_IMPORT_TTL_MS) {
      localStorage.removeItem(watchedImportStorageKey(username));
      return null;
    }
    return imported.films || null;
  } catch {
    return null;
  }
}

function saveWatchedImport(member) {
  try {
    localStorage.setItem(watchedImportStorageKey(member.input), JSON.stringify({
      films: member.importedFilms,
      savedAt: Date.now()
    }));
  } catch {
    // Large exports can exceed browser storage. The current comparison still works.
  }
}

function watchedMember(input) {
  const saved = readWatchedState(input);
  return {
    input,
    username: saved?.username || input.trim().replace(/^@/, ''),
    importedFilms: readWatchedImport(input),
    pages: saved?.pages || {},
    totalPages: saved?.totalPages || null,
    truncated: Boolean(saved?.truncated),
    complete: Boolean(saved?.complete)
  };
}

function watchlistStorageKey(username) {
  return `watchmatch:watchlist:v1:${username.trim().toLowerCase()}`;
}

function watchlistImportStorageKey(username) {
  return `watchmatch:watchlist-import:v1:${username.trim().replace(/^@/, '').toLowerCase()}`;
}

function readWatchlistState(username) {
  try {
    const raw = localStorage.getItem(watchlistStorageKey(username));
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state.savedAt || Date.now() - state.savedAt > WATCHED_CACHE_TTL_MS) {
      localStorage.removeItem(watchlistStorageKey(username));
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function saveWatchlistState(member) {
  try {
    localStorage.setItem(watchlistStorageKey(member.input), JSON.stringify({
      username: member.username,
      pages: member.pages,
      totalPages: member.totalPages,
      complete: member.complete,
      savedAt: Date.now()
    }));
  } catch {
    // The comparison still works if private browsing blocks local storage.
  }
}

function readWatchlistImport(username) {
  try {
    const raw = localStorage.getItem(watchlistImportStorageKey(username));
    if (!raw) return null;
    const imported = JSON.parse(raw);
    if (!imported.savedAt || Date.now() - imported.savedAt > WATCHED_IMPORT_TTL_MS) {
      localStorage.removeItem(watchlistImportStorageKey(username));
      return null;
    }
    return imported.films || null;
  } catch {
    return null;
  }
}

function saveWatchlistImport(member) {
  try {
    localStorage.setItem(watchlistImportStorageKey(member.input), JSON.stringify({
      films: member.importedFilms,
      savedAt: Date.now()
    }));
  } catch {
    // Large exports can exceed browser storage. The current comparison still works.
  }
}

function watchlistMember(input) {
  const saved = readWatchlistState(input);
  return {
    input,
    username: saved?.username || input.trim().replace(/^@/, ''),
    importedFilms: readWatchlistImport(input),
    pages: saved?.pages || {},
    totalPages: saved?.totalPages || null,
    truncated: false,
    complete: Boolean(saved?.complete)
  };
}

function memberFilms(member) {
  if (member.importedFilms) return member.importedFilms;
  const deduped = new Map();
  Object.keys(member.pages)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach(page => {
      for (const film of member.pages[page] || []) deduped.set(film.slug, film);
    });
  return [...deduped.values()].slice(0, WATCHED_FILM_LIMIT);
}

function memberHasFullHistory(member) {
  return Boolean(member.importedFilms || member.complete || member.totalPages === 1);
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function parseExportCsv(text, mode) {
  const exportName = mode === 'watchlist' ? 'watchlist.csv' : 'watched.csv';
  const listName = mode === 'watchlist' ? 'watchlist films' : 'watched films';
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error(`That file does not contain any ${listName}.`);
  const headers = rows[0].map(header => header.replace(/^\uFEFF/, '').trim().toLowerCase());
  const nameIndex = headers.indexOf('name');
  const yearIndex = headers.indexOf('year');
  const uriIndex = headers.indexOf('letterboxd uri');
  if (nameIndex < 0 || uriIndex < 0) {
    throw new Error(`Choose ${exportName} from the unzipped Letterboxd export.`);
  }

  const films = new Map();
  for (const row of rows.slice(1)) {
    const name = (row[nameIndex] || '').trim();
    const year = yearIndex >= 0 ? (row[yearIndex] || '').trim() : '';
    const url = (row[uriIndex] || '').trim();
    const slug = url.match(/\/film\/([^/?#]+)/i)?.[1];
    if (!name || !slug) continue;
    films.set(slug, {
      slug,
      title: year ? `${name} (${year})` : name,
      year,
      poster: '',
      url: url || `https://letterboxd.com/film/${slug}/`
    });
  }
  if (!films.size) throw new Error(`No films were found. Choose ${exportName} from the Letterboxd export.`);
  return [...films.values()];
}

async function importCollectionCsv(member, file, members, errorEl, mode) {
  try {
    errorEl.textContent = 'Reading file…';
    member.importedFilms = parseExportCsv(await file.text(), mode);
    if (mode === 'watchlist') saveWatchlistImport(member);
    else saveWatchedImport(member);
    const data = collectionComparisonData(members, !members.every(memberHasFullHistory), mode);
    cache[mode] = { data };
    renderCollection(data, mode);
  } catch (error) {
    errorEl.textContent = error.message || 'That file could not be read.';
    errorEl.classList.add('error');
  }
}

function collectionImportPanel(members, mode) {
  const exportName = mode === 'watchlist' ? 'watchlist.csv' : 'watched.csv';
  const panel = document.createElement('section');
  panel.className = 'watched-import-panel';
  const heading = document.createElement('h3');
  heading.textContent = 'Want the complete match?';
  const copy = document.createElement('p');
  copy.textContent = `Each person can export their Letterboxd data, unzip it, and choose ${exportName} here. Your confirmed partial matches stay visible above.`;
  const exportLink = document.createElement('a');
  exportLink.href = 'https://letterboxd.com/settings/data/';
  exportLink.target = '_blank';
  exportLink.rel = 'noopener noreferrer';
  exportLink.textContent = 'Open Letterboxd data export →';
  const fields = document.createElement('div');
  fields.className = 'watched-import-fields';

  for (const member of members) {
    const field = document.createElement('div');
    field.className = 'watched-import-field';
    const label = document.createElement('label');
    label.textContent = `@${member.username}'s ${exportName}`;
    field.appendChild(label);
    if (memberHasFullHistory(member)) {
      const loaded = document.createElement('span');
      loaded.className = 'watched-import-loaded';
      loaded.textContent = member.importedFilms ? `Loaded ${member.importedFilms.length} films ✓` : 'Complete from public profile ✓';
      field.appendChild(loaded);
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,text/csv';
      const feedback = document.createElement('small');
      feedback.textContent = `Choose the unzipped ${exportName} file`;
      input.addEventListener('change', () => {
        if (input.files?.[0]) importCollectionCsv(member, input.files[0], members, feedback, mode);
      });
      field.append(input, feedback);
    }
    fields.appendChild(field);
  }

  const privacy = document.createElement('small');
  privacy.className = 'watched-import-privacy';
  privacy.textContent = 'Private by design: CSV files are read and saved in this browser only. They are never sent to WatchMatch or Vercel.';
  panel.append(heading, copy, exportLink, fields, privacy);
  return panel;
}

function updateCollectionProgress(members, mode) {
  const loadedPages = members.reduce((sum, member) => sum + Object.keys(member.pages).length, 0);
  const totalPages = members.reduce((sum, member) => sum + (member.totalPages || 1), 0);
  const loadedFilms = members.reduce((sum, member) => sum + memberFilms(member).length, 0);
  const label = mode === 'watchlist' ? 'watchlist films' : 'watched films';
  gridEl.innerHTML = `
    <div class="loading-grid">
      <strong>Loading ${label}…</strong><br>
      <span>${loadedPages} of ${totalPages} profile pages loaded · ${loadedFilms} films found</span><br>
      <small>Checking the public pages Letterboxd allows without repeated retries.</small>
    </div>`;
}

async function requestCollectionPage(member, page, mode) {
  const params = new URLSearchParams({
    mode,
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
  if (mode === 'watchlist') saveWatchlistState(member);
  else saveWatchedState(member);
}

function collectionComparisonData(members, partial = false, mode = 'watched') {
  const lists = members.map(memberFilms);
  const secondSlugs = new Set(lists[1].map(film => film.slug));
  const matches = lists[0].filter(film => secondSlugs.has(film.slug));
  const loadedPages = members.reduce((sum, member) => sum + Object.keys(member.pages).length, 0);
  const totalPages = members.reduce((sum, member) => sum + (member.totalPages || 1), 0);
  return {
    users: members.map(member => member.username),
    mode,
    partial,
    memberStates: members,
    progress: { loadedPages, totalPages },
    counts: lists.map(list => list.length),
    sources: members.map((member, index) => ({
      username: member.username,
      label: mode === 'watchlist' ? 'Watchlist' : 'Watched films',
      status: lists[index].length ? 'public' : 'empty',
      truncated: member.truncated
    })),
    matches
  };
}

async function loadCollectionComparison(user1, user2, mode) {
  const makeMember = mode === 'watchlist' ? watchlistMember : watchedMember;
  const members = [makeMember(user1), makeMember(user2)];
  let madeRequest = false;
  updateCollectionProgress(members, mode);

  try {
    for (const member of members) {
      if (memberHasFullHistory(member) || member.pages[1]) continue;
      if (madeRequest) await sleep(WATCHED_PAGE_DELAY_MS);
      await requestCollectionPage(member, 1, mode);
      madeRequest = true;
      updateCollectionProgress(members, mode);
    }
  } catch (error) {
    const loadedPages = members.reduce((sum, member) => sum + Object.keys(member.pages).length, 0);
    if (loadedPages > 0) return collectionComparisonData(members, true, mode);
    throw error;
  }

  return collectionComparisonData(members, !members.every(memberHasFullHistory), mode);
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
    if (cache[mode].error) renderError(cache[mode].error, mode);
    else if (mode === 'watched' || (mode === 'watchlist' && cache[mode].data.partial)) {
      renderCollection(cache[mode].data, mode);
    }
    else render(cache[mode].data, mode);
    return;
  }

  showLoading(mode);
  tabs.forEach(tab => { tab.disabled = true; });
  try {
    if (mode === 'watched') {
      const data = await loadCollectionComparison(user1, user2, mode);
      cache[mode] = { data };
      renderCollection(data, mode);
      return;
    }
    const params = new URLSearchParams({ user1, user2, mode });
    const response = await fetch(`/api/match?${params.toString()}`);
    let data = await response.json().catch(() => ({}));
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
    if (mode === 'watchlist' && data.partial && data.memberStates) {
      for (const member of data.memberStates) {
        member.importedFilms = readWatchlistImport(member.input);
      }
      data = collectionComparisonData(
        data.memberStates,
        !data.memberStates.every(memberHasFullHistory),
        'watchlist'
      );
    }
    cache[mode] = { data };
    if (mode === 'watchlist' && data.partial) renderCollection(data, mode);
    else render(data, mode);
  } catch (error) {
    const friendlyError = {
      title: error.title,
      message: error.message || 'Something went wrong.',
      users: [user1, user2],
      resumable: false
    };
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

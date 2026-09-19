const user1El = document.getElementById('user1');
const user2El = document.getElementById('user2');
const btn = document.getElementById('matchBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const gridEl = document.getElementById('movieGrid');
const countEl = document.getElementById('matchCount');
const pairEl = document.getElementById('pairLabel');
const shuffleBtn = document.getElementById('shuffleBtn');
let currentMovies = [];

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = `status${isError ? ' error' : ''}`;
}
function hideStatus() { statusEl.className = 'status hidden'; }

function card(movie, index) {
  const article = document.createElement('article');
  article.className = 'movie-card';
  article.dataset.index = index;
  const link = document.createElement('a');
  link.className = 'poster-link';
  link.href = movie.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = `Open ${movie.title} on Letterboxd`;

  if (movie.poster) {
    const img = document.createElement('img');
    img.src = movie.poster;
    img.alt = `${movie.title} poster`;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => {
      img.remove();
      const fallback = document.createElement('div');
      fallback.className = 'poster-fallback';
      fallback.textContent = movie.title;
      link.appendChild(fallback);
    };
    link.appendChild(img);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'poster-fallback';
    fallback.textContent = movie.title;
    link.appendChild(fallback);
  }

  const title = document.createElement('div');
  title.className = 'movie-title';
  title.textContent = movie.title;
  title.title = movie.title;

  article.appendChild(link);
  article.appendChild(title);
  if (movie.year) {
    const year = document.createElement('div');
    year.className = 'movie-year';
    year.textContent = movie.year;
    article.appendChild(year);
  }
  return article;
}

function render(data) {
  currentMovies = data.matches || [];
  gridEl.innerHTML = '';
  currentMovies.forEach((m, i) => gridEl.appendChild(card(m, i)));
  countEl.textContent = currentMovies.length;
  pairEl.textContent = `@${data.users[0]} × @${data.users[1]}`;
  resultsEl.classList.remove('hidden');
  if (!currentMovies.length) showStatus('No shared watchlist movies found. If you expected matches, one of the watchlists may be private or Letterboxd may have changed its page markup.');
  else hideStatus();
}

async function match() {
  const user1 = user1El.value.trim();
  const user2 = user2El.value.trim();
  if (!user1 || !user2) return showStatus('Enter two Letterboxd usernames or URLs.', true);
  resultsEl.classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = 'Checking both watchlists…';
  showStatus('Fetching the public watchlists. Large watchlists can take a little longer because Letterboxd paginates them.');
  try {
    const params = new URLSearchParams({ user1, user2 });
    const res = await fetch(`/api/match?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
    render(data);
  } catch (err) {
    showStatus(err.message || 'Something went wrong.', true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Find our movies <span aria-hidden="true">→</span>';
  }
}

btn.addEventListener('click', match);
[user1El, user2El].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') match(); }));
shuffleBtn.addEventListener('click', () => {
  document.querySelectorAll('.movie-card').forEach(el => el.classList.remove('highlight'));
  if (!currentMovies.length) return;
  const i = Math.floor(Math.random() * currentMovies.length);
  const chosen = document.querySelector(`.movie-card[data-index="${i}"]`);
  chosen?.classList.add('highlight');
  chosen?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

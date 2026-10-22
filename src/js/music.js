const MUSIC_DATA_URL = 'https://anthonyhuang.net/api/music'; // Music API URL
let musicData = null;
let musicDataPromise = null;
const youtubeMusicSearchUrl = (title, artist) =>
  `https://music.youtube.com/search?q=${encodeURIComponent(`${title} ${artist}`)}`;
const songUrl = (song) => song.link?.trim() || youtubeMusicSearchUrl(song.title, song.artist);

function loadMusicData() {
  if (musicData) {
    return Promise.resolve(musicData);
  }
  if (!musicDataPromise) {
    musicDataPromise = fetch(MUSIC_DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load music data');
        return response.json();
      })
      .then((data) => {
        musicData = data;
        return data;
      })
      .catch((error) => {
        console.error('Error fetching music data:', error);
        musicDataPromise = null;
        return {};
      });
  }
  return musicDataPromise;
}

// #region Album Art Resolution

function norm(s) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")      // accents
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")        // punctuation -> space
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveAlbumArt(title, artist) {
  const qTitle = norm(title);
  const qArtist = norm(artist);

  const query = encodeURIComponent(`${title} ${artist}`);
  const res = await fetch(
    `https://anthonyhuang.net/api/applemusic?term=${query}&limit=10`
  );

  if (!res.ok) return null;

  const data = await res.json();
  const results = Array.isArray(data.results) ? data.results : [];
  if (!results.length) return null;

  // Keep only candidates that match the artist
  const candidates = results.filter(r => {
    const a = norm(r.artistName);
    const t = norm(r.trackName);

    const artistMatch = a === qArtist || a.includes(qArtist) || qArtist.includes(a);
    const titleMatch = t === qTitle;

    return artistMatch && (titleMatch || t.includes(qTitle));
  });

  const pool = candidates.length ? candidates : results;

  // Score candidates: exact title match + artist match + "single-ish" bonus + small trackCount bonus
  let best = null;
  let bestScore = -Infinity;

  for (const r of pool) {
    if (!r?.artworkUrl100) continue;

    let score = 0;

    const c = norm(r.collectionName);
    const t = norm(r.trackName);

    if (c === t) score += 10;

    // Smaller collections tend to be singles/EPs
    // (on iTunes, track results often include collection trackCount)
    if (typeof r.trackCount === "number") {
      if (r.trackCount <= 3) score += 15;      // single / small EP
      else if (r.trackCount >= 10) score -= 5; // album-ish
    }

    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  if (!best?.artworkUrl100) return null;

  return best.artworkUrl100.replace("100x100", "400x400");
}

// #endregion

// #region Favorite Song

async function renderFavoriteSong(details) {
  const container = document.querySelector('.music-favoriteSong');

  const albumArt =
    details.albumArt?.trim() ||
    (await resolveAlbumArt(details.title, details.artist));

  container.innerHTML = `
    <h2>Current Obsession</h2>
    <a href="${songUrl(details)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${details.title} by ${details.artist}">
      <img src="${albumArt ?? '/img/placeholder.png'}" />
      <div>
        <div>
          <h6>${details.favoriteDate}</h6>
          <p>${details.title}</p>
          <h5>${details.artist}</h5>
        </div>

        <span class="open">Open</span>
      </div>
    </a>
  `;
}

// #endregion

// #region Featured Songs

async function renderFeaturedSongs(songs = []) {
  const container = document.querySelector('.music-featuredSongs');

  const resolvedSongs = await Promise.all(
    songs.map(async (song) => {
      const albumArt = song.albumArt?.trim() || await resolveAlbumArt(song.title, song.artist);
      return { ...song, albumArt };
    })
  );

  const gridHtml = resolvedSongs
    .map((song, index) => `
      <button class="song" type="button" data-song-index="${index}">
        <img src="${song.albumArt}"
             alt="Album art for ${song.title} by ${song.artist}" />
        <div class="meta">
          <p class="title">${song.title}</p>
          <p class="artist">${song.artist}</p>
        </div>
      </button>
    `)
    .join('');

  container.innerHTML = `
    <h2>Now Listening</h2>
    <div class="featuredSongs-grid">
      ${gridHtml}
    </div>
  `;

  container.querySelectorAll('.song').forEach((button) => {
    button.addEventListener('click', () => {
      const song = resolvedSongs[button.dataset.songIndex];
      window.open(songUrl(song), '_blank', 'noopener,noreferrer');
    });
  });
}

// #endregion

// #region Favorite Artists

function renderFavoriteArtists(artists = []) {
  const container = document.querySelector('.music-favoriteArtists');

  const gridHtml = artists
    .map(artist => `
      <a class="artist" href="${artist.link}" target="_blank" rel="noopener noreferrer" aria-label="Open artist ${artist.name}">
        <img src="${artist.art}" alt="Album art for ${artist.name}" />
        <p class="artist-name">${artist.name}</p>
      </a>
    `)
    .join('');

  container.innerHTML = `
    <h2>Favorite Artists</h2>
    <div class="artists-row">${gridHtml}</div>
  `;
}

// #endregion

// #region Playlists

function renderPlaylists(playlists = []) {
  const container = document.querySelector('.music-playlists');

  const gridHtml = playlists
    .map(playlist => `
      <a class="playlist" href="${playlist.link}" target="_blank" rel="noopener noreferrer" aria-label="Open playlist ${playlist.name}">
        <img src="${playlist.art}" alt="Playlist art for ${playlist.name}" />
        <div class="meta">
          <p class="playlist-name">${playlist.name}</p>
        </div>
      </a>
    `)
    .join('');

  container.innerHTML = `
    <h2>Playlists</h2>
    <div class="playlists-row">${gridHtml}</div>
  `;
}

// #endregion

// #region Now Playing

const nowPlayingBar = document.querySelector('.music-nowPlaying');
const nowPlayingArt = nowPlayingBar.querySelector('img');
const nowPlayingText = nowPlayingBar.querySelector(':scope > div > div');
let currentNowPlaying = null;
let currentNowPlayingKey = null;

nowPlayingBar.addEventListener('click', () => {
  if (!nowPlayingBar.classList.contains('searchable')) return;

  window.open(
    `https://music.youtube.com/search?q=${encodeURIComponent(`${currentNowPlaying.song} ${currentNowPlaying.artist}`)}`,
    '_blank',
    'noopener,noreferrer'
  );
});

function renderNowPlaying(data) {
  const status = data.status;
  let playback = { playing: false };

  if (status?.type === 'LISTENING') {
    let imageUrl = status.assets?.largeImage;
    if (typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
      imageUrl = '/assets/icons/defaultMusic.webp';
    }
    if (imageUrl.startsWith('mp:external/')) {
      imageUrl = `https://${imageUrl.split('/https/').pop()}`;
    }

    playback = {
      playing: true,
      paused: data.online === false,
      imageUrl,
      song: status.details,
      artist: status.state
    };
  }

  const stateKey = JSON.stringify(playback);
  if (stateKey === currentNowPlayingKey) return;

  currentNowPlaying = playback;
  currentNowPlayingKey = stateKey;
  nowPlayingBar.classList.remove('searchable');
  nowPlayingArt.onload = null;
  nowPlayingArt.onerror = null;
  nowPlayingArt.src = '/assets/icons/defaultMusic.webp';
  nowPlayingBar.querySelectorAll('.notPlayingBadge, .playingControlsBadge').forEach(badge => badge.remove());

  if (!playback.playing) {
    nowPlayingText.innerHTML = '<p>Not Playing</p>';
  } else {
    nowPlayingText.innerHTML = `
      <p class="music-nowPlaying-song"></p>
      <p class="music-nowPlaying-artist"></p>
    `;
    nowPlayingText.querySelector('.music-nowPlaying-song').textContent = playback.song;
    nowPlayingText.querySelector('.music-nowPlaying-artist').textContent = playback.artist;

    nowPlayingArt.onload = () => {
      const usesDefaultArt = new URL(nowPlayingArt.src, window.location.href).pathname === '/assets/icons/defaultMusic.webp';
      if (!usesDefaultArt && currentNowPlayingKey === stateKey) {
        nowPlayingBar.classList.add('searchable');
      }
    };
    nowPlayingArt.onerror = () => {
      nowPlayingBar.classList.remove('searchable');
      nowPlayingArt.onload = null;
      nowPlayingArt.onerror = null;
      nowPlayingArt.src = '/assets/icons/defaultMusic.webp';
    };
    // Keep the default visible while remote artwork loads or stalls.
    const artwork = new Image();
    artwork.onload = () => {
      if (currentNowPlayingKey === stateKey) nowPlayingArt.src = playback.imageUrl;
    };
    artwork.src = playback.imageUrl;
  }

  const badge = document.createElement('img');
  const showNotPlaying = !playback.playing || playback.paused;
  badge.className = showNotPlaying ? 'notPlayingBadge' : 'playingControlsBadge';
  badge.src = showNotPlaying ? '/assets/elements/notPlaying.png' : '/assets/elements/playingControls.png';
  badge.alt = showNotPlaying ? 'Not Playing' : 'Playback Controls';
  nowPlayingBar.appendChild(badge);
}

document.addEventListener('musicstatuschange', event => renderNowPlaying(event.detail));

function loadPlaybackStatus() { // load music status from api
  fetch('https://anthonyhuang.net/api/status')
    .then(response => response.json())
    .then(data => document.dispatchEvent(new CustomEvent('musicstatuschange', { detail: data })))
    .catch(error => console.error('Error fetching playback status:', error));
}

// #endregion

document.addEventListener("DOMContentLoaded", () => {
  loadPlaybackStatus();
  setInterval(loadPlaybackStatus, 1000);

  loadMusicData()
    .then((data) => {
      renderFavoriteSong(data.favoriteSong);
      renderFeaturedSongs(data.featuredSongs);
      renderFavoriteArtists(data.favoriteArtists);
      renderPlaylists(data.playlists);
    })
});

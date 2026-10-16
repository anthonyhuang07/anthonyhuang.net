const dynamicIsland = document.getElementById('dynamicIsland');
const albumArt = dynamicIsland.querySelectorAll('.island-albumArt');
const audioPreview = dynamicIsland.querySelectorAll('.island-audioPreview');
const songNameElement = dynamicIsland.querySelector('#songName');
const artistNameElement = dynamicIsland.querySelector('#artistName');
const currentTimeElement = dynamicIsland.querySelector('#currentTime');
const timeLeft = dynamicIsland.querySelector('#timeLeft');
const progressBar = dynamicIsland.querySelector('.progress-bar .progress');
const mediaControls = dynamicIsland.querySelector('#mediaControls');
let frozenPlayback = null;
let frozenSessionId = null;
let currentAlbumArtUrl = null;

let hoverUnlockTimer = null;

function unlockDynamicIslandHover() {
  clearTimeout(hoverUnlockTimer);
  hoverUnlockTimer = null;
  dynamicIsland.classList.remove('hover-locked');
}

dynamicIsland.addEventListener('mouseleave', () => {
  if (!dynamicIsland.classList.contains('playing')) return;

  dynamicIsland.classList.add('hover-locked');
  clearTimeout(hoverUnlockTimer);
  hoverUnlockTimer = setTimeout(unlockDynamicIslandHover, 800);
});

dynamicIsland.addEventListener('animationend', (event) => {
  if (event.target === dynamicIsland && event.animationName === 'dynamicIslandCollapse') {
    unlockDynamicIslandHover();
  }
});

// Dynamic Island click handling: open Music app
dynamicIsland.addEventListener('click', (e) => {
  e.preventDefault();
  const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  if (isMobile) {
    return;
  }
  if (typeof appOpen === 'function') {
    appOpen(4);
  }
});

document.addEventListener('click', (e) => {
  if (!dynamicIsland.contains(e.target) && dynamicIsland.classList.contains('expanded')) {
    dynamicIsland.classList.remove('expanded');
  }
});

function updateDynamicIsland(data) {
      let musicPlaying = false;
      const isOnline = data.online !== false;
      if (data.status && data.status.type === "LISTENING") {
        musicPlaying = true;
        let imageUrl = data.status?.assets?.largeImage;
        if (typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
          imageUrl = '/assets/icons/defaultMusic.webp';
        }
        let songName = data.status.details;
        let artistName = data.status.state;
        let startTime = new Date(data.status.timestamps.start).getTime();
        let endTime = new Date(data.status.timestamps.end).getTime();
        let currentTime = Date.now();
        let duration = endTime - startTime;
        let elapsed = currentTime - startTime;
        let remaining = duration - elapsed;
        const sessionId = data.status.sessionId || `${songName}-${artistName}-${startTime}`;

        if (!isOnline) {
          if (!frozenPlayback || frozenSessionId !== sessionId) {
            frozenPlayback = data.frozenPlayback || { duration, elapsed, remaining };
            frozenSessionId = sessionId;
          }
          elapsed = frozenPlayback.elapsed;
          remaining = frozenPlayback.remaining;
        } else {
          frozenPlayback = null;
          frozenSessionId = null;
        }

        if (imageUrl.startsWith('mp:external/')) {
          let fixedUrl = imageUrl.split('/https/').pop();
          imageUrl = 'https://' + fixedUrl;
        }

        if (imageUrl !== currentAlbumArtUrl) {
          dynamicIsland.classList.remove('ready');
          currentAlbumArtUrl = imageUrl;

          albumArt.forEach(img => {
            img.onload = () => {
              if (img.getAttribute('src') === '/assets/icons/defaultMusic.webp') {
                dynamicIsland.style.removeProperty('--album-art');
              } else {
                dynamicIsland.style.setProperty('--album-art', `url(${JSON.stringify(img.src)})`);
              }
              dynamicIsland.classList.add('ready');
            };

            img.onerror = () => {
              img.onerror = null;
              img.src = '/assets/icons/defaultMusic.webp';
            };
            img.src = '/assets/icons/defaultMusic.webp';
          });

          const artwork = new Image();
          artwork.onload = () => {
            if (currentAlbumArtUrl === imageUrl) {
              albumArt.forEach(img => img.src = imageUrl);
            }
          };
          artwork.src = imageUrl;
        }

        songNameElement.textContent = songName;
        artistNameElement.textContent = artistName;

        if (remaining > 0) {
          timeLeft.textContent = formatTime(remaining);
          currentTimeElement.textContent = formatTime(elapsed);
          progressBar.style.width = `${(elapsed / duration) * 100}%`;
        }
      }

      if (!musicPlaying) {
        dynamicIsland.classList.remove('playing');
        dynamicIsland.classList.remove('paused');
        dynamicIsland.classList.remove('ready');
        frozenPlayback = null;
        frozenSessionId = null;
        currentAlbumArtUrl = null;
        albumArt.forEach(img => img.style.display = 'none');
        audioPreview.forEach(preview => preview.style.display = 'none');
        if (mediaControls) {
          mediaControls.src = '/assets/elements/dynamicIslandControls.png';
        }

      } else {
        const isPaused = data.online === false;
        dynamicIsland.classList.add('playing');
        if (isPaused) {
          dynamicIsland.classList.add('paused');
          if (mediaControls) {
            mediaControls.src = '/assets/elements/dynamicIslandControlsPaused.png';
          }
        } else {
          dynamicIsland.classList.remove('paused');
          if (mediaControls) {
            mediaControls.src = '/assets/elements/dynamicIslandControls.png';
          }
        }
        albumArt.forEach(img => img.style.display = 'block');
        audioPreview.forEach(preview => preview.style.display = 'flex');

      }

}

function formatTime(ms) {
  let totalSeconds = Math.floor(ms / 1000);
  let minutes = Math.floor(totalSeconds / 60);
  let seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

document.addEventListener('musicstatuschange', event => updateDynamicIsland(event.detail));

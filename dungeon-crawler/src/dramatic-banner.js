// Centre-screen dramatic title/subtitle overlay used for one-shot unlock moments
// (e.g. "Stances Unlocked" after meeting the stance NPC). Styled to match the
// level-up overlay's gold-on-black theme.

export function showDramaticUnlock(title, subtitle = '') {
  let overlay = document.getElementById('dramatic-unlock-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'dramatic-unlock-overlay';
    document.body.appendChild(overlay);
  }

  const banner = document.createElement('div');
  banner.className = 'dramatic-unlock-banner';

  const titleEl = document.createElement('div');
  titleEl.className = 'du-title';
  titleEl.textContent = title;
  banner.appendChild(titleEl);

  if (subtitle) {
    const subEl = document.createElement('div');
    subEl.className = 'du-subtitle';
    subEl.textContent = subtitle;
    banner.appendChild(subEl);
  }

  overlay.appendChild(banner);

  requestAnimationFrame(() => banner.classList.add('du-show'));

  setTimeout(() => {
    banner.classList.remove('du-show');
    setTimeout(() => banner.remove(), 800);
  }, 4200);
}

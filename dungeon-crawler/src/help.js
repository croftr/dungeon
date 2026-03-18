// Show a one-time contextual help dialog. Does nothing if help is disabled or the key
// has already been shown this session.
export function showInlineHelp(key, options = {}) {
  if (!window.helpEnabled) return;
  if (!window._helpSeen) window._helpSeen = new Set();
  if (window._helpSeen.has(key)) return;
  window._helpSeen.add(key);
  showHelpDialog(options);
}

export function showHelpDialog({ text = '', image = null, onDismiss = null } = {}) {
  let overlay = document.getElementById('help-dialog-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'help-dialog-overlay';

    overlay.innerHTML = `
      <div id="help-dialog-parchment">
        <div id="help-dialog-image-wrapper" style="display:none; text-align:center; margin-bottom: 25px;">
          <img id="help-dialog-image" src="" style="max-width: 100%; max-height: 250px; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); border: 2px solid #5d4037;" alt="Help Graphic" />
        </div>
        <div id="help-dialog-content"></div>
        <button id="help-dialog-dismiss">OK</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('help-dialog-dismiss').addEventListener('click', () => {
      overlay.classList.remove('visible');
      setTimeout(() => {
        if (overlay.onClose) overlay.onClose();
        overlay.onClose = null;
      }, 300); // match transition ms
    });
  }

  const contentEl = document.getElementById('help-dialog-content');
  const imgWrapper = document.getElementById('help-dialog-image-wrapper');
  const imgEl = document.getElementById('help-dialog-image');

  if (image) {
    imgEl.src = image;
    imgWrapper.style.display = 'block';
  } else {
    imgWrapper.style.display = 'none';
    imgEl.src = '';
  }

  if (text) {
    contentEl.innerHTML = text;
    contentEl.style.display = 'block';
  } else {
    contentEl.style.display = 'none';
  }

  overlay.onClose = onDismiss;

  // Force reflow and show
  overlay.offsetHeight;
  overlay.classList.add('visible');
}

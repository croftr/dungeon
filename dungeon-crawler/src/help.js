export function showHelpDialog(contentHTML, onDismiss) {
  let overlay = document.getElementById('help-dialog-overlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'help-dialog-overlay';
    
    overlay.innerHTML = `
      <div id="help-dialog-parchment">
        <div id="help-dialog-content"></div>
        <button id="help-dialog-dismiss">Aye, I understand</button>
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
  contentEl.innerHTML = contentHTML;
  overlay.onClose = onDismiss;
  
  // Force reflow and show
  overlay.offsetHeight;
  overlay.classList.add('visible');
}

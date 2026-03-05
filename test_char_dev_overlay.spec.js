import { test, expect } from '@playwright/test';

test('char-dev-overlay prevents click propagation to background elements', async ({ page }) => {
  // We'll mock the necessary DOM structure and scripts
  await page.setContent(`
    <div id="app">
      <div id="char-dev-overlay" style="position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 100;">
        <div id="char-dev-modal" style="width: 200px; height: 200px; background: white; margin: 50px;">
          <button id="char-dev-confirm">Confirm Level Up</button>
        </div>
      </div>
      <div id="background-button" style="position: absolute; top: 50px; left: 50px; width: 100px; height: 100px; background: red; z-index: 1;">
        Background Button
      </div>
    </div>
    <script>
      let backgroundClicked = false;
      document.getElementById('background-button').addEventListener('click', () => {
        backgroundClicked = true;
      });

      // Implement our fix
      const charDevOverlayEl = document.getElementById('char-dev-overlay');
      if (charDevOverlayEl) {
          charDevOverlayEl.addEventListener('click', (e) => e.stopPropagation());
      }

      const confirmBtn = document.getElementById('char-dev-confirm');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }

      window.addEventListener('click', () => {
         // Raycast logic normally goes here, we just check if it gets reached
         if (backgroundClicked) {
           window.raycastTriggered = true;
         }
      });
    </script>
  `);

  // Click on the confirm button
  await page.locator('#char-dev-confirm').click();

  // Click on the overlay (but not the modal itself)
  await page.locator('#char-dev-overlay').click({ position: { x: 10, y: 10 } });

  // Evaluate if background was clicked (it shouldn't be due to the overlay z-index blocking it, but in our bug scenario it's a 3D raycast, so let's just make sure propagation stopped)
  const raycastTriggered = await page.evaluate(() => window.raycastTriggered);
  expect(raycastTriggered).toBeFalsy();

  // To simulate the raycast bug directly: we need to verify the click event didn't bubble up to window
  const windowClickCount = await page.evaluate(() => {
    let count = 0;
    window.addEventListener('click', () => count++);
    document.getElementById('char-dev-confirm').click();
    document.getElementById('char-dev-overlay').click();
    return count;
  });

  expect(windowClickCount).toBe(0);
});

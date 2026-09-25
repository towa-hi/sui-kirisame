export const page = /* html */ `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Kirisame</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        min-height: 100svh;
        background: #f3f5f1;
        color: #243c32;
        font-family: system-ui, sans-serif;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 2rem;
        width: min(100% - 4rem, 72rem);
        margin: 0 auto;
        padding: 1.5rem 0;
        border-bottom: 1px solid #cad4cc;
      }
      .brand { font-weight: 650; letter-spacing: -.02em; }
      nav { display: flex; gap: .25rem; padding: .25rem; border-radius: .75rem; background: #e7ebe5; }
      button {
        border: 0;
        border-radius: .55rem;
        padding: .65rem 1.1rem;
        background: transparent;
        color: #526358;
        font: inherit;
        cursor: pointer;
      }
      button[aria-selected="true"] { background: #fff; color: #243c32; box-shadow: 0 1px 5px #243c3214; }
      button:focus-visible { outline: 2px solid #557866; outline-offset: 2px; }
      main { width: min(100% - 4rem, 72rem); margin: 0 auto; padding: clamp(5rem, 12vw, 9rem) 0; }
      [role="tabpanel"][hidden] { display: none; }
      .panel-content { max-width: 36rem; }
      .eyebrow { font-size: .75rem; letter-spacing: .16em; text-transform: uppercase; }
      h1 { margin: 1rem 0; font-size: clamp(3rem, 10vw, 5rem); font-weight: 500; letter-spacing: -.05em; }
      p { line-height: 1.7; }
      .status { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #cad4cc; color: #526358; }
      @media (max-width: 36rem) {
        header { width: min(100% - 2rem, 72rem); flex-direction: column; align-items: stretch; gap: 1rem; }
        nav { width: 100%; }
        button { flex: 1; padding-inline: .5rem; }
        main { width: min(100% - 2rem, 72rem); padding-top: 4rem; }
      }
    </style>
  </head>
  <body>
    <header>
      <span class="brand">Kirisame</span>
      <nav role="tablist" aria-label="Kirisame sections">
        <button id="user-tab" role="tab" aria-selected="true" aria-controls="user-panel" data-tab="user">User</button>
        <button id="station-tab" role="tab" aria-selected="false" aria-controls="station-panel" data-tab="station" tabindex="-1">Station</button>
        <button id="admin-tab" role="tab" aria-selected="false" aria-controls="admin-panel" data-tab="admin" tabindex="-1">Admin</button>
      </nav>
    </header>
    <main>
      <section id="user-panel" role="tabpanel" aria-labelledby="user-tab">
        <div class="panel-content">
          <p class="eyebrow">Umbrella sharing on Sui</p>
          <h1>Kirisame</h1>
          <p>An umbrella for the next rainy day.</p>
          <p class="status">Under construction. Features are coming one at a time.</p>
        </div>
      </section>
      <section id="station-panel" role="tabpanel" aria-labelledby="station-tab" hidden>
        <div class="panel-content"><p class="eyebrow">Station</p><h1>Kirisame</h1><p class="status">Under construction. Features are coming one at a time.</p></div>
      </section>
      <section id="admin-panel" role="tabpanel" aria-labelledby="admin-tab" hidden>
        <div class="panel-content"><p class="eyebrow">Admin</p><h1>Kirisame</h1><p class="status">Under construction. Features are coming one at a time.</p></div>
      </section>
    </main>
    <script>
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      function selectTab(tab) {
        for (const item of tabs) {
          const selected = item === tab;
          item.setAttribute('aria-selected', String(selected));
          item.tabIndex = selected ? 0 : -1;
          document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
        }
      }
      for (const tab of tabs) {
        tab.addEventListener('click', () => selectTab(tab));
        tab.addEventListener('keydown', (event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const next = tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
          selectTab(next);
          next.focus();
        });
      }
    </script>
  </body>
</html>`;

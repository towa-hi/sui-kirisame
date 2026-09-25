export const placeholder = /* html */ `<!doctype html>
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
        display: grid;
        place-items: center;
        padding: 2rem;
        background: #f3f5f1;
        color: #243c32;
        font-family: system-ui, sans-serif;
      }
      main { width: 100%; max-width: 36rem; }
      .eyebrow { font-size: .75rem; letter-spacing: .16em; text-transform: uppercase; }
      h1 { margin: 1rem 0; font-size: clamp(3rem, 10vw, 5rem); font-weight: 500; letter-spacing: -.05em; }
      p { line-height: 1.7; }
      .status { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #cad4cc; color: #526358; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Umbrella sharing on Sui</p>
      <h1>Kirisame</h1>
      <p>An umbrella for the next rainy day.</p>
      <p class="status">Under construction. Features are coming one at a time.</p>
    </main>
  </body>
</html>`;

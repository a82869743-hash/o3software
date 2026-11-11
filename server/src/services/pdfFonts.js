// Invoice fonts bundled with the server (no internet needed when printing a PDF).
const fs = require('fs');
const path = require('path');

let _css = null;
function fontFaceCss() {
  if (_css !== null) return _css;
  try {
    const dir = path.join(__dirname, '..', 'assets', 'fonts');
    const list = JSON.parse(fs.readFileSync(path.join(dir, 'fonts.json'), 'utf8'));
    _css = list.map(([family, weight, file]) =>
      `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;` +
      `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}) format('woff2');}`).join('\n');
  } catch { _css = ''; }
  return _css;
}

/** Swap any Google Fonts <link> in a PDF's HTML for the bundled fonts. */
function inlineFonts(html) {
  if (!/fonts\.googleapis\.com/.test(html)) return html;
  return html.replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/g, '').replace('<head>', `<head><style>${fontFaceCss()}</style>`);
}

module.exports = { inlineFonts, fontFaceCss };

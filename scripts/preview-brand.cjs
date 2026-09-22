const { chromium } = require('playwright');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 440, height: 160 } });
    const brand = fs.readFileSync('auth.js', 'utf8').match(/<a class="brand"[^>]*>.*?<\/a>/)[0];
    await page.setContent('<style>' + fs.readFileSync('styles.css', 'utf8') + '</style><div style="padding:45px">' + brand + '</div>');
    await page.screenshot({ path: 'test-results/brand-wordmark.png' });
    await page.setViewportSize({ width: 1100, height: 260 });
    const svg = fs.readFileSync('assets/brand/pulsetech-wordmark.svg', 'utf8');
    await page.setContent('<style>html,body{margin:0;background:transparent}</style><img width="1100" height="260" src="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '">');
    await page.locator('img').evaluate(image => image.decode());
    await page.screenshot({ path: 'assets/brand/pulsetech-wordmark.png', omitBackground: true });
    console.log('Site preview and downloadable wordmark rendered.');
  } finally {
    await browser.close();
  }
})();

const { chromium } = require("C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
    args: ["--disable-gpu", "--disable-software-rasterizer"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".landing-hero");
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: "C:/Users/HP/Documents/Coppel hackathon/clearlot-landing-preview.png",
  });

  const computed = await page.$eval(".landing-visual", (element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      border: style.borderColor,
      radius: style.borderRadius,
      shadow: style.boxShadow,
    };
  });

  await page.getByRole("button", { name: /Explorar plataforma/i }).click();
  await page.waitForSelector(".pantalla-carga-global, .pantalla-acceso-wrapper");
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "C:/Users/HP/Documents/Coppel hackathon/clearlot-access-preview.png",
  });
  console.log(JSON.stringify(computed));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

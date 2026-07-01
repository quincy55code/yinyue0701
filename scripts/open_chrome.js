const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome'  // 使用系统安装的 Google Chrome
  });
  const page = await browser.newPage();
  // 浏览器保持打开，不自动关闭
  console.log('Chrome 已启动，关闭此窗口或按 Ctrl+C 退出');
})();

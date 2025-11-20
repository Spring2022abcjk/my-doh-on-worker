import { baseCSS } from './ui/css.js';
import { clientScript } from './ui/client.js';
import { pageShell, formHTML, tabsHTML, tabContentHTML } from './ui/markup.js';

// 组合函数：将分离的 CSS、HTML 片段与脚本组装成最终页面
export function buildHTML({ dohPath, upstreamHost }) {
  const html = pageShell({
    upstreamHost,
    dohPath,
    formHTML: formHTML.replace('(占位)', dohPath),
    tabsHTML,
    tabContentHTML
  });
  // 将 CSS 与脚本插入占位
  const scriptTag = `<script>${clientScript(JSON.stringify(dohPath))}</script>`;
  return html.replace('<style id="inline-style"></style>', `<style id="inline-style">${baseCSS}</style>`)
             .replace('</body>', scriptTag + '</body>');
}

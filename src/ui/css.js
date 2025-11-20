// 基础样式抽离，便于单独维护
export const baseCSS = `body{font-family:'Segoe UI',sans-serif;background:#f7f7f7;margin:0;padding:24px;}
.container{max-width:880px;margin:0 auto;background:#fff;border-radius:14px;padding:30px 32px;box-shadow:0 8px 28px rgba(0,0,0,.08);}
pre{background:#faf8f6;padding:14px;border-radius:6px;font-size:13px;}
.ip-record{padding:6px 10px;border:1px solid #eee;border-radius:6px;margin-bottom:6px;background:#fff;}
.ip-address{font-family:monospace;cursor:pointer;position:relative;}
.ip-address.copied:after{content:'已复制';position:absolute;left:100%;margin-left:8px;color:#f15c2e;font-size:12px;}
.badge{font-size:11px;}
.geo-loading{font-style:italic;color:#999;}
.geo-blocked{background:#dc3545;color:#fff;padding:2px 6px;border-radius:4px;font-weight:600;}
.ttl-info{color:#555;font-size:12px;}
.copy-link{cursor:pointer;color:#f15c2e;text-decoration:none;border-bottom:1px dashed #f15c2e;}
.copy-link.copied:after{content:'已复制';margin-left:6px;color:#f15c2e;}`;

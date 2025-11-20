// 页面结构与静态 HTML 片段
export function pageShell({ upstreamHost, dohPath, formHTML, tabsHTML, tabContentHTML }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>DNS-over-HTTPS Resolver</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" />
  <style id="inline-style"></style>
</head>
<body>
<div class="container">
  <h1 class="mb-4">DNS-over-HTTPS Resolver</h1>
  <div class="mb-2 small text-muted">上游: <strong>${upstreamHost}</strong> | 路径令牌: <code>${dohPath}</code></div>
  ${formHTML}
  <div id="loading" class="my-2" style="display:none;">查询中...</div>
  <div id="errorBox" style="display:none;" class="alert alert-danger"></div>
  <div id="resultContainer" style="display:none;">
    ${tabsHTML}
    ${tabContentHTML}
    <div class="mt-3"><button id="copyBtn" class="btn btn-sm btn-outline-secondary" style="display:none;">复制结果 JSON</button></div>
  </div>
  <hr />
  <div class="small">本地 DoH：<span id="localDoh" class="copy-link">https://<span id="hostSpan"></span>/${dohPath}</span></div>
</div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`;
}

export const formHTML = `<form id="resolveForm" class="row g-3 mb-3">
  <div class="col-md-5">
    <label class="form-label">DoH 服务</label>
    <select id="dohSelect" class="form-select">
      <option value="current" selected>当前站点 (占位)</option>
      <option value="https://cloudflare-dns.com/dns-query">Cloudflare</option>
      <option value="https://dns.google/resolve">Google</option>
      <option value="https://dns.alidns.com/resolve">AliDNS</option>
      <option value="https://sm2.doh.pub/dns-query">Tencent</option>
      <option value="custom">自定义...</option>
    </select>
  </div>
  <div id="customBox" class="col-md-7" style="display:none;">
    <label class="form-label">自定义 DoH URL</label>
    <input id="customDoh" class="form-control" placeholder="https://example.com/dns-query" />
  </div>
  <div class="col-md-8">
    <label class="form-label">域名</label>
    <input id="domain" class="form-control" value="www.google.com" />
  </div>
  <div class="col-md-4 d-flex align-items-end gap-2">
    <button class="btn btn-primary flex-grow-1" type="submit">解析 (A/AAAA/NS)</button>
    <button id="getJsonBtn" class="btn btn-outline-secondary" type="button">Get JSON</button>
  </div>
</form>`;

export const tabsHTML = `<ul class="nav nav-tabs" role="tablist">
  <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#ipv4" type="button">IPv4</button></li>
  <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#ipv6" type="button">IPv6</button></li>
  <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#ns" type="button">NS/SOA</button></li>
  <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#raw" type="button">原始</button></li>
</ul>`;

export const tabContentHTML = `<div class="tab-content border border-top-0 p-3">
  <div id="ipv4" class="tab-pane fade show active">
    <div id="ipv4Summary" class="small text-muted mb-2"></div>
    <div id="ipv4Records"></div>
  </div>
  <div id="ipv6" class="tab-pane fade">
    <div id="ipv6Summary" class="small text-muted mb-2"></div>
    <div id="ipv6Records"></div>
  </div>
  <div id="ns" class="tab-pane fade">
    <div id="nsSummary" class="small text-muted mb-2"></div>
    <div id="nsRecords"></div>
  </div>
  <div id="raw" class="tab-pane fade">
    <pre id="rawJson">等待查询...</pre>
  </div>
</div>`;

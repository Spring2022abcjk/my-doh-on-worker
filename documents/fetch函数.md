先给出一个鸟瞰：这个 `fetch(request, env)` 是整个 Worker 的“路由分发器”。它先基于环境变量做一次运行时配置，然后按请求的路径/查询参数把流量分派到不同的处理分支（DoH 转发、DNS 聚合、IP 地理信息、反代、或返回内置 HTML）。

下面按执行顺序说明它怎么工作：

1) 启动时的动态配置
- 解析 env.DOH：如果设置了完整 URL，会提取 host 存回变量 DoH（仅用于页面展示）。
- 设置 DoH路径：优先取 env.PATH，其次 env.TOKEN，默认值为 "dns-query"；若包含斜杠，仅保留第一个斜杠后的段作为路径令牌。
- 解析当前请求 URL，得到 pathname 和 hostname。

注意：上游常量 jsonDoH/dnsDoH 在文件顶层用初始 DoH 计算（cloudflare-dns.com）后就固定了；即便 env.DOH 改了，实际转发仍指向 Cloudflare 上游。这点与“显示用的 DoH”存在差异，是当前实现的一个细节/限制。

2) CORS 预检
- 若是 OPTIONS，直接返回允许跨域的响应头（通配允许，Max-Age 86400）。

3) DoH 透传端点
- 当 path 精确等于 `/${DoH路径}` 时，进入 DoHRequest：
  - 支持三类 DoH 请求：
    - GET `?name=域名[&type=A]`（JSON，强制返回 application/json）
    - GET `?dns=base64url`（application/dns-message）
    - POST 原始二进制 DNS 报文（application/dns-message）
  - 后端优先打 `dnsDoH`，失败再打 `jsonDoH`，并统一补 CORS 响应头。

4) IP 地理信息代理
- 当 path 为 `/ip-info`：
  - 若设置了 env.TOKEN，要求 query 中 `token` 一致；否则 403。
  - 读取 `ip` 参数（没有则取请求头 CF-Connecting-IP），转发到 `http://ip-api.com/json/<ip>?lang=zh-CN`，把结果 JSON 回传并加上 timestamp。
  - 失败会返回结构化错误对象（含错误类型与栈首行）并带 CORS。

5) DNS 聚合查询（前端 UI 用）
- 若 URL 上有 `doh` 参数，走聚合查询分支：
  - 读取 `domain`（默认 www.google.com），`doh`（上游端点 URL，默认为 dnsDoH），`type`（默认 all）。
  - 若 `doh` 指向当前站点 host，则走 `handleLocalDohRequest`，直接访问固定上游 `dnsDoH`，避免自递归。
  - type=all：并发请求 A/AAAA/NS 三类，合并结果：
    - 顶层保留 `Status/TC/RD/RA/AD/CD/Question` 等字段
    - 分类输出到 `ipv4.records`/`ipv6.records`/`ns.records`
    - NS 会从 Answer 与 Authority 两处收集，并把 SOA(type=6) 也并到总 Answer，便于展示
  - 单类型：调用 `queryDns(doh, domain, type)`，它会尝试多种 Accept 头容错不同上游的 Content-Type。
  - 全程 JSON + CORS，错误时返回 500 与详细错误信息。

6) 兜底逻辑
- 若设置了 `env.URL302`：对未命中其它分支的请求做 302 重定向。
- 否则若设置了 `env.URL`：
  - 值为 'nginx' 时，返回内置的 nginx 欢迎页 HTML。
  - 否则通过 `代理URL` 做简单反代：支持多地址列表（逗号/引号/换行/制表），会随机选一个后端，拼接原请求路径与查询再转发，并在响应头加 `X-New-URL` 便于排查。
- 若以上都没有：返回内置 HTML UI（`HTML()`），这个页面会调用上面两个后端接口：`?doh=...&domain=...&type=all` 和 `/ip-info`。

你可以把这个流程理解为：
- 预检 -> DoH 透传 -> 地理查询 -> 聚合查询 -> 跳转/反代 -> HTML UI
- 每个 JSON 分支都带统一 CORS，方便浏览器直接使用。

如果你想，我也可以帮你把 env.DOH 真正用于上游转发（让 dnsDoH/jsonDoH 随请求重算），避免“显示与转发不一致”的现象。
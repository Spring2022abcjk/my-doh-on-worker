// 浏览器版 DoH 测试脚本（不依赖 Node https 模块）
(function () {
  const $ = (id) => document.getElementById(id);
  const encoder = new TextEncoder(); // 预留：如需日后将域名转字节等

  function base64url(buf) {
    let bin = Array.from(buf)
      .map((b) => String.fromCharCode(b))
      .join("");
    let b64 = btoa(bin)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return b64;
  }

  function createDnsQuery(domain, qtype) {
    // 仅构造一个标准查询报文 (ID 固定 0x1234, RD=1)
    const labels = domain.split(".");
    const parts = [];
    for (const label of labels) {
      parts.push(label.length);
      for (let i = 0; i < label.length; i++) parts.push(label.charCodeAt(i));
    }
    parts.push(0); // 结束
    // QTYPE 映射
    const typeMap = { A: 1, AAAA: 28, NS: 2, CNAME: 5 };
    const t = typeMap[qtype] || 1;
    const header = [
      0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    // parts 已包含结尾的 0x00（QNAME 终止），此处不要再额外加一个 0x00
    const question = [...parts, (t >> 8) & 0xff, t & 0xff, 0x00, 0x01];
    return new Uint8Array([...header, ...question]);
  }

  function parseDnsName(view, offset) {
    let name = "";
    let jumped = false;
    let jumpOffset = 0;
    while (offset < view.length) {
      const len = view[offset];
      if (len === 0) {
        offset++;
        break;
      }
      if ((len & 0xc0) === 0xc0) {
        if (!jumped) {
          jumpOffset = offset + 2;
          jumped = true;
        }
        offset = ((len & 0x3f) << 8) | view[offset + 1];
        continue;
      }
      if (offset + len + 1 > view.length) break;
      if (name) name += ".";
      name += new TextDecoder().decode(
        view.slice(offset + 1, offset + len + 1)
      );
      offset += len + 1;
    }
    return { name, newOffset: jumped ? jumpOffset : offset };
  }

  function parseDnsMessage(buf) {
    const view = new Uint8Array(buf);
    if (view.length < 12) return { error: "too short" };
    const dv = new DataView(view.buffer);
    const id = dv.getUint16(0);
    const flags = dv.getUint16(2);
    const qdcount = dv.getUint16(4),
      ancount = dv.getUint16(6),
      nscount = dv.getUint16(8),
      arcount = dv.getUint16(10);
    let offset = 12;
    const questions = [];
    const answers = [];
    for (let i = 0; i < qdcount; i++) {
      const { name, newOffset } = parseDnsName(view, offset);
      if (newOffset + 4 > view.length) break;
      const qtype = dv.getUint16(newOffset);
      const qclass = dv.getUint16(newOffset + 2);
      questions.push({ name, type: qtype, class: qclass });
      offset = newOffset + 4;
    }
    for (let i = 0; i < ancount && offset < view.length; i++) {
      const { name, newOffset } = parseDnsName(view, offset);
      if (newOffset + 10 > view.length) break;
      const type = dv.getUint16(newOffset);
      const cls = dv.getUint16(newOffset + 2);
      const ttl = dv.getUint32(newOffset + 4);
      const rdlen = dv.getUint16(newOffset + 8);
      const dataStart = newOffset + 10;
      let rdata = "";
      if (dataStart + rdlen <= view.length) {
        if (type === 1 && rdlen === 4) {
          rdata = Array.from(view.slice(dataStart, dataStart + 4)).join(".");
        } else if (type === 28 && rdlen === 16) {
          const segs = [];
          for (let j = 0; j < 16; j += 2) {
            segs.push(view.slice(dataStart + j, dataStart + j + 2));
          }
          rdata = Array.from(segs)
            .map((s) => "" + ((s[0] << 8) | s[1]).toString(16))
            .join(":")
            .replace(/(:0)+/, "::");
        } else {
          rdata = Array.from(view.slice(dataStart, dataStart + rdlen))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        }
      }
      answers.push({ name, type, ttl, rdata });
      offset = dataStart + rdlen;
    }
    return {
      id,
      counts: { qdcount, ancount, nscount, arcount },
      questions,
      answers,
    };
  }

  function fmtMs(ms) {
    return ms.toFixed(1);
  }
  function classifyContentType(ct) {
    if (!ct) return "";
    ct = ct.toLowerCase();
    if (ct.includes("dns-message")) return "dns-message";
    if (ct.includes("json")) return "json";
    return ct.split(";")[0];
  }

  async function runSingle(test) {
    const start = performance.now();
    try {
      const resp = await fetch(test.url, test.init);
      const elapsed = performance.now() - start;
      const ct = resp.headers.get("content-type") || "";
      let bodyBuf = new Uint8Array(await resp.arrayBuffer());
      let parsed = null;
      let preview = "";
      if (test.kind === "dns" && ct.includes("dns-message")) {
        parsed = parseDnsMessage(bodyBuf);
        const ans =
          parsed && Array.isArray(parsed.answers) ? parsed.answers : [];
        preview = ans.length
          ? ans
              .slice(0, 4)
              .map((a) => a.rdata)
              .join(", ")
          : "(no answers)";
      } else if (ct.includes("json")) {
        const text = new TextDecoder().decode(bodyBuf);
        preview = text.slice(0, 120);
      } else {
        preview = Array.from(bodyBuf.slice(0, 32))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ");
      }
      return {
        ok: resp.ok,
        status: resp.status,
        elapsed,
        ct: classifyContentType(ct),
        preview,
        parsed,
        raw: bodyBuf,
      };
    } catch (err) {
      return {
        ok: false,
        status: "ERR",
        elapsed: performance.now() - start,
        ct: "",
        preview: err.message,
        error: err,
      };
    }
  }

  function renderRow(t, r) {
    let tb = $("resultBody");
    if (!tb) {
      console.warn("[DoH Test] #resultBody 不存在，自动创建结果表结构。");
      // 自动构建缺失的 table 结构
      const table = document.createElement("table");
      table.id = "resultTable";
      table.style.width = "100%";
      table.innerHTML = `<thead><tr><th>协议</th><th>状态</th><th>耗时(ms)</th><th>类型</th><th>摘要</th></tr></thead>`;
      tb = document.createElement("tbody");
      tb.id = "resultBody";
      table.appendChild(tb);
      // 插入到 panel 末尾
      const panel = document.querySelector(".panel") || document.body;
      panel.appendChild(table);
    }
    const parentEl = tb.parentElement;
    if (parentEl) parentEl.style.display = "table";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${t.label}</td><td class="${
      r.ok ? "status-ok" : "status-err"
    }">${r.ok ? "✅ " + r.status : "❌ " + r.status}</td><td>${fmtMs(
      r.elapsed
    )}</td><td>${r.ct}</td><td>${r.preview}</td>`;
    tb.appendChild(tr);
  }

  function renderAnswers(parsed) {
    const answersBlock = $("answersBlock");
    const box = $("answers");
    if (!answersBlock || !box) {
      console.warn(
        "[DoH Test] answersBlock 或 answers 容器缺失，跳过解析答案渲染。"
      );
      return;
    }
    if (!parsed || !parsed.answers || !parsed.answers.length) {
      answersBlock.style.display = "none";
      box.innerHTML = "";
      return;
    }
    answersBlock.style.display = "block";
    box.innerHTML = "";
    parsed.answers.forEach((a) => {
      const div = document.createElement("div");
      const typeMap = { 1: "A", 28: "AAAA", 5: "CNAME", 2: "NS", 6: "SOA" };
      const typeStr = typeMap[a.type] || "T" + a.type;
      div.className = "dns-answer";
      div.innerHTML = `<span><span class="badge">${typeStr}</span>${a.rdata}</span><span style="color:#555;">TTL: ${a.ttl}</span>`;
      box.appendChild(div);
    });
  }

  function showRaw(buf) {
    let rawBlock = $("rawBlock");
    let pre = $("rawData");
    // 若结构缺失则自动创建
    if (!rawBlock) {
      console.warn("[DoH Test] rawBlock 缺失，自动创建。");
      rawBlock = document.createElement("details");
      rawBlock.id = "rawBlock";
      rawBlock.innerHTML = "<summary>原始响应预览</summary>";
      pre = document.createElement("pre");
      pre.id = "rawData";
      rawBlock.appendChild(pre);
      const panel = document.querySelector(".panel") || document.body;
      panel.appendChild(rawBlock);
    }
    if (!pre) {
      pre = document.createElement("pre");
      pre.id = "rawData";
      rawBlock.appendChild(pre);
    }
    rawBlock.style.display = "block";
    pre.textContent = Array.from(buf)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
  }

  async function runTests() {
    // 防御：确保核心输入元素存在，避免 null.value 抛错
    const endpointEl = $("endpoint");
    const domainEl = $("domain");
    const qtypeEl = $("qtype");
    const modeEl = $("runMode");
    if (!endpointEl || !domainEl || !qtypeEl || !modeEl) {
      alert(
        "页面结构不完整：缺少必要的输入元素 (#endpoint/#domain/#qtype/#runMode)。请确认 HTML 已正确加载。"
      );
      return;
    }
    const endpoint = endpointEl.value.trim();
    const domain = domainEl.value.trim();
    const qtype = qtypeEl.value;
    const mode = modeEl.value;
    if (!endpoint || !domain) {
      alert("请输入端点与域名");
      return;
    }

    const statusLineEl = $("statusLine");
    const answersBlockEl = $("answersBlock");
    const rawBlockEl = $("rawBlock");
    if (!statusLineEl) {
      console.warn("[DoH Test] #statusLine 未找到，跳过状态更新。");
    } else {
      statusLineEl.innerHTML = '<span class="loading-inline"></span>运行中...';
    }
    if (answersBlockEl) answersBlockEl.style.display = "none";
    if (rawBlockEl) rawBlockEl.style.display = "none";

    const dnsQuery = createDnsQuery(domain, qtype);
    const dnsParam = base64url(dnsQuery);

    const tests = [];
    if (mode === "all" || mode === "binary" || mode === "get-only") {
      tests.push({
        label: "RFC8484 GET",
        kind: "dns",
        url: `${endpoint}?dns=${dnsParam}`,
        init: {
          method: "GET",
          headers: {
            Accept: "application/dns-message,application/dns-json,*/*",
          },
        },
      });
      if (mode !== "get-only") {
        tests.push({
          label: "RFC8484 POST",
          kind: "dns",
          url: endpoint,
          init: {
            method: "POST",
            headers: {
              "Content-Type": "application/dns-message",
              Accept: "application/dns-message,*/*",
            },
            body: dnsQuery,
          },
        });
      }
    }
    if (mode === "all" || mode === "json") {
      tests.push({
        label: "JSON API GET",
        kind: "json",
        url: `${endpoint}?name=${encodeURIComponent(domain)}&type=${qtype}`,
        init: {
          method: "GET",
          headers: { Accept: "application/dns-json,application/json,*/*" },
        },
      });
    }

    const runBtnEl = $("runBtn");
    if (runBtnEl) runBtnEl.disabled = true;
    for (const t of tests) {
      const r = await runSingle(t);
      renderRow(t, r);
      if (r.parsed) renderAnswers(r.parsed);
      if (r.raw) showRaw(r.raw);
    }
    if (runBtnEl) runBtnEl.disabled = false;
    if (statusLineEl)
      statusLineEl.textContent = "完成：共 " + tests.length + " 项测试";
  }

  function attachEvents() {
    const runBtn = $("runBtn");
    const clearBtn = $("clearBtn");
    const rawBtn = $("rawBtn");

    if (!runBtn || !clearBtn || !rawBtn) {
      console.warn("[DoH Test] 部分按钮未找到，延迟重试绑定。");
      setTimeout(attachEvents, 100); // 简单重试一次
      return;
    }

    // 额外防御：提示输入区域是否存在
    if (!$("endpoint") || !$("domain")) {
      console.warn(
        "[DoH Test] 输入框 #endpoint 或 #domain 未找到，运行测试会失败。"
      );
    }

    runBtn.addEventListener("click", runTests);
    clearBtn.addEventListener("click", () => {
      const rb = $("resultBody");
      if (rb) rb.innerHTML = "";
      const rt = $("resultTable");
      if (rt) rt.style.display = "none";
      const ans = $("answers");
      if (ans) ans.innerHTML = "";
      const ansBlock = $("answersBlock");
      if (ansBlock) ansBlock.style.display = "none";
      const rawBlock = $("rawBlock");
      if (rawBlock) rawBlock.style.display = "none";
      const rawData = $("rawData");
      if (rawData) rawData.textContent = "";
      const statusLine = $("statusLine");
      if (statusLine) statusLine.textContent = "已清空";
    });
    rawBtn.addEventListener("click", () => {
      const block = $("rawBlock");
      if (!block) {
        console.warn("[DoH Test] rawBlock 不存在，无法切换展示。");
        return;
      }
      block.style.display = block.style.display === "none" ? "block" : "none";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachEvents);
  } else {
    attachEvents();
  }
})();

// 前端交互脚本，参数化 dohPath，避免后端大段拼接
export function clientScript(dohPathLiteral) {
  return `(() => {
    // 生成可读性更高的多行客户端脚本，保持所有功能不变
    const proto = location.protocol;
    const host = location.host;
    const dohPath = ${dohPathLiteral};
    const localDoh = proto + '//' + host + '/' + dohPath;
    const $ = (id) => document.getElementById(id);
    const create = (t) => document.createElement(t);

    let activeDoh = localDoh;
    $('#hostSpan').textContent = host;

    // ===== 下拉框选择逻辑 =====
    $('#dohSelect').addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'custom') {
        $('customBox').style.display = 'block';
      } else {
        $('customBox').style.display = 'none';
      }
      if (val === 'current') {
        activeDoh = localDoh;
      } else if (val !== 'custom') {
        activeDoh = val;
      }
    });

    // ===== 打开原始 JSON 请求窗口 =====
    $('#getJsonBtn').addEventListener('click', () => {
      const domain = $('domain').value.trim();
      if (!domain) { alert('请输入域名'); return; }
      let doh = activeDoh;
      if ($('#dohSelect').value === 'custom') {
        doh = $('customDoh').value.trim();
        if (!doh) { alert('自定义 DoH URL 为空'); return; }
      }
      const u = new URL(doh);
      u.searchParams.set('name', domain);
      window.open(u.toString(), '_blank');
    });

    // ===== 表单提交：综合查询 A/AAAA/NS =====
    $('#resolveForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const domain = $('domain').value.trim();
      if (!domain) { alert('请输入域名'); return; }
      let doh = activeDoh;
      if ($('#dohSelect').value === 'custom') {
        doh = $('customDoh').value.trim();
        if (!doh) { alert('自定义 DoH URL 为空'); return; }
      }
      $('loading').style.display = 'block';
      $('errorBox').style.display = 'none';
      $('resultContainer').style.display = 'none';
      try {
        const resp = await fetch('?doh=' + encodeURIComponent(doh) + '&domain=' + encodeURIComponent(domain) + '&type=all');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        render(data);
      } catch (err) {
        $('errorBox').textContent = '查询失败: ' + err.message;
        $('errorBox').style.display = 'block';
      } finally {
        $('loading').style.display = 'none';
      }
    });

    // ===== 工具函数：TTL 格式化、阻断判断 =====
    function ttlFmt(s) {
      if (s < 60) return s + 's';
      if (s < 3600) return Math.floor(s / 60) + 'm';
      if (s < 86400) return Math.floor(s / 3600) + 'h';
      return Math.floor(s / 86400) + 'd';
    }
    function isBlocked(ip) {
      return ['104.21.16.1','104.21.32.1','104.21.48.1'].includes(ip) || ['2606:4700:3030::6815:1001'].includes(ip);
    }

    // ===== 渲染结果主函数 =====
    function render(data) {
      $('resultContainer').style.display = 'block';
      $('rawJson').textContent = JSON.stringify(data, null, 2);
      $('copyBtn').style.display = 'inline-block';
      const v4 = data.ipv4?.records || [];
      $('ipv4Records').innerHTML = '';
      $('ipv4Summary').textContent = 'IPv4: ' + v4.length + ' 条';
      v4.forEach(r => addRecord('ipv4Records', r));
      const v6 = data.ipv6?.records || [];
      $('ipv6Records').innerHTML = '';
      $('ipv6Summary').textContent = 'IPv6: ' + v6.length + ' 条';
      v6.forEach(r => addRecord('ipv6Records', r));
      const ns = data.ns?.records || [];
      $('nsRecords').innerHTML = '';
      $('nsSummary').textContent = 'NS/SOA: ' + ns.length + ' 条';
      ns.forEach(r => addRecord('nsRecords', r));
    }

    // ===== 添加单条记录（含复制与地理信息异步加载） =====
    function addRecord(containerId, r) {
      const wrap = create('div');
      wrap.className = 'ip-record';
      const badge = r.type === 1 ? 'A' : r.type === 28 ? 'AAAA' : r.type === 5 ? 'CNAME' : r.type === 2 ? 'NS' : r.type === 6 ? 'SOA' : 'T' + r.type;
      wrap.innerHTML = '<div class="d-flex justify-content-between align-items-center">' +
        '<span class="ip-address" data-copy="' + r.data + '">' + r.data + '</span>' +
        '<span class="badge bg-secondary">' + badge + '</span>' +
        '<span class="ttl-info">TTL: ' + ttlFmt(r.TTL || 0) + '</span>' +
      '</div>';
      const ipEl = wrap.querySelector('.ip-address');
      ipEl.addEventListener('click', () => {
        navigator.clipboard.writeText(ipEl.getAttribute('data-copy')).then(() => {
          ipEl.classList.add('copied');
          setTimeout(() => ipEl.classList.remove('copied'), 1600);
        });
      });
      if (r.type === 1 || r.type === 28) {
        const geo = create('div');
        geo.className = 'geo-loading small mt-1';
        geo.textContent = '定位中...';
        wrap.appendChild(geo);
        fetch('./ip-info?ip=' + encodeURIComponent(r.data) + '&token=' + encodeURIComponent(dohPath))
          .then(x => x.json())
          .then(j => {
            geo.className = 'small mt-1';
            if (isBlocked(r.data)) {
              geo.innerHTML = '<span class="geo-blocked">阻断IP</span>' + (j.as ? ' ' + j.as : '');
            } else {
              geo.textContent = (j.country || '未知') + (j.as ? ' ' + j.as : '');
            }
          })
          .catch(() => { geo.textContent = '定位失败'; });
      }
      document.getElementById(containerId).appendChild(wrap);
    }

    // ===== 复制 JSON 按钮 =====
    $('#copyBtn').addEventListener('click', () => {
      const txt = $('rawJson').textContent;
      navigator.clipboard.writeText(txt).then(() => {
        const b = $('copyBtn');
        const o = b.textContent;
        b.textContent = '已复制';
        setTimeout(() => b.textContent = o, 1400);
      });
    });

    // ===== 复制本地 DoH =====
    $('#localDoh').addEventListener('click', (e) => {
      navigator.clipboard.writeText(localDoh).then(() => {
        e.target.classList.add('copied');
        setTimeout(() => e.target.classList.remove('copied'), 1400);
      });
    });
  })();`;
}

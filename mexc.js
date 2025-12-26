// ==UserScript==
// @name         MEXC Orderbook to IDR Modal (FULL FIX)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  MEXC orderbook IDR conversion (Binance-style, fixed selectors)
// @match        https://www.mexc.com/*/exchange/*
// @match        https://www.mexc.fm/*/exchange/*
// @grant        GM_xmlhttpRequest
// @connect      indodax.com
// ==/UserScript==

(function () {
  'use strict';

  let RATE_IDR = 16500;
  let PRICE_PRECISION = 2;
  const MAX_ROWS = 20;
  const REFRESH_INTERVAL = 30000;
  let lastUrl = location.href;

  function getBaseCurrency() {
    const m = location.pathname.match(/exchange\/([A-Z0-9]+)_([A-Z0-9]+)/i);
    return m ? m[2].toUpperCase() : 'USDT';
  }
  let BASE = getBaseCurrency();

  const PAIR_MAP = {
    USDT: 'usdtidr',
    BTC: 'btcidr',
    ETH: 'ethidr',
    BNB: 'bnbidr',
  };

  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      BASE = getBaseCurrency();
      header.textContent = `MEXC Orderbook → IDR (kurs 1 ${BASE})`;
      info.textContent = `Memuat kurs ${BASE}...`;
      updateHeaders();
      detectPrecision();
      updateRate();
      update();
    }
  }, 1000);

  function detectPrecision() {
    const el = document.querySelector('[class*="lastPrice"]');
    if (!el) return setTimeout(detectPrecision, 1500);
    const txt = el.textContent.trim();
    if (txt.includes('.')) {
      PRICE_PRECISION = txt.split('.')[1].replace(/0+$/, '').length || 1;
    }
  }
  detectPrecision();

  function parseNumber(str) {
    if (!str) return NaN;
    let mult = 1;
    str = String(str).trim();
    const suf = str.match(/([KMB])$/i);
    if (suf) {
      if (suf[1].toUpperCase() === 'K') mult = 1e3;
      if (suf[1].toUpperCase() === 'M') mult = 1e6;
      if (suf[1].toUpperCase() === 'B') mult = 1e9;
      str = str.slice(0, -1);
    }
    str = str.replace(/\u00A0/g, '').replace(/,/g, '');
    const n = parseFloat(str);
    return isFinite(n) ? n * mult : NaN;
  }

  const fmtIDR = (n) =>
    isFinite(n) ? n.toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '-';

  const fmtIDRPrice = (n) => {
    if (!isFinite(n)) return '-';
    if (n < 1) return n.toLocaleString('id-ID', { minimumFractionDigits: 6 });
    if (n < 1000) return n.toLocaleString('id-ID', { minimumFractionDigits: 2 });
    return n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
  };

  // ======================
  // 🪟 Modal
  // ======================
  const modal = document.createElement('div');
  Object.assign(modal.style, {
    position: 'fixed',
    right: '20px',
    top: '120px',
    width: '420px',
    background: 'rgba(30,30,30,0.95)',
    color: '#f0f0f0',
    border: '1px solid #555',
    borderRadius: '8px',
    zIndex: 999999,
    padding: '10px',
    fontFamily: 'Consolas, monospace',
    fontSize: '12px',
    resize: 'both',
    overflow: 'auto',
  });

  const header = document.createElement('div');
  header.textContent = `MEXC Orderbook → IDR (kurs 1 ${BASE})`;
  Object.assign(header.style, {
    cursor: 'move',
    fontWeight: 'bold',
    marginBottom: '6px',
    color: '#ffcc00',
    userSelect: 'none',
  });

  const info = document.createElement('div');
  info.style.fontSize = '11px';
  info.style.opacity = '0.8';

  function makeTable() {
    const t = document.createElement('table');
    t.style.width = '100%';
    t.style.borderCollapse = 'collapse';
    t.innerHTML = `
      <thead>
        <tr style="background:#444">
          <th style="text-align:left;padding:4px">price (${BASE})</th>
          <th style="padding:4px">price (IDR)</th>
          <th style="padding:4px">vol (IDR)</th>
        </tr>
      </thead>
      <tbody></tbody>`;
    return t;
  }

  const asksTable = makeTable();
  const bidsTable = makeTable();

  function updateHeaders() {
    modal.querySelectorAll('thead th:first-child')
      .forEach(th => th.textContent = `price (${BASE})`);
  }

  modal.append(header, asksTable, info, bidsTable);
  document.body.appendChild(modal);

  // ======================
  // 🖱 DRAG FIX (MEXC SAFE)
  // ======================
  (function drag(el, handle) {
    let sx = 0, sy = 0, dragging = false;

    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      sx = e.clientX - el.offsetLeft;
      sy = e.clientY - el.offsetTop;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      el.style.left = e.clientX - sx + 'px';
      el.style.top = e.clientY - sy + 'px';
      el.style.right = 'auto';
    });

    window.addEventListener('pointerup', () => dragging = false);
  })(modal, header);

  // ======================
  // 💱 Kurs
  // ======================
  function updateRate() {
    const ticker = PAIR_MAP[BASE] || 'usdtidr';
    GM_xmlhttpRequest({
      method: 'GET',
      url: `https://indodax.com/api/ticker/${ticker}`,
      onload: res => {
        const j = JSON.parse(res.responseText);
        const last = parseFloat(j.ticker?.last);
        if (last) {
          RATE_IDR = last;
          info.textContent = `1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`;
          update();
        }
      }
    });
  }
  updateRate();
  setInterval(updateRate, REFRESH_INTERVAL);

  // ======================
  // 📊 Extract
  // ======================
  function extract(side) {
    const wrapper = document.querySelector(
      side === 'ask'
        ? '[class*="orderbook_asksWrapper"]'
        : '[class*="orderbook_bidsWrapper"]'
    );
    if (!wrapper) return [];

    const rows = wrapper.querySelectorAll('[class*="orderbook_orderbookItem"]');
    const data = [];

    for (const r of Array.from(rows).slice(0, MAX_ROWS)) {
      const priceEl = r.querySelector('[class*="orderbook_price"]');
      const volEl = r.querySelector('[class*="orderbook_vol"] span');
      if (!priceEl || !volEl) continue;

      const price = parseNumber(priceEl.textContent);
      const vol = parseNumber(volEl.textContent);
      if (!isFinite(price) || !isFinite(vol)) continue;

      data.push({
        rawPrice: priceEl.textContent.trim(),
        price,
        idrPrice: price * RATE_IDR,
        volIDR: price * vol * RATE_IDR,
      });
    }
    return data;
  }

  function render(tbl, data, color) {
    const body = tbl.querySelector('tbody');
    body.innerHTML = '';

    for (const r of data) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:4px;text-align:left;color:${color};cursor:pointer">
          ${r.rawPrice}
        </td>
        <td style="padding:4px;text-align:right;color:#ffd966">
          ${fmtIDRPrice(r.idrPrice)}
        </td>
        <td style="padding:4px;text-align:right">
          ${fmtIDR(r.volIDR)}
        </td>`;
      tr.onclick = () => fillPrice(r.price);
      body.appendChild(tr);
    }
  }

  function fillPrice(price) {
    const v = price.toFixed(PRICE_PRECISION);
    document.querySelectorAll('input[placeholder*="Price"]').forEach(i => {
      i.value = v;
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function update() {
    render(asksTable, extract('ask'), '#ff6666');
    render(bidsTable, extract('bid'), '#66ff66');
  }

  function initObserver() {
    const root = document.querySelector('[class*="orderbook_tableBody"]');
    if (!root) return setTimeout(initObserver, 1500);

    new MutationObserver(update).observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    update();
  }

  initObserver();
})();

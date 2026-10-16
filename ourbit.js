// ==UserScript==
// @name         Ourbit Orderbook → IDR Modal (Realtime, Click-to-Fill)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Convert Ourbit orderbook to IDR in a draggable modal, realtime update via DOM, click row to fill price input (supports base currency & Indodax rate)
// @match        https://www.ourbit.com/exchange/*
// @match        https://www.ourbit.com/*/exchange/*
// @match        https://*.ourbit.com/exchange/*
// @match        https://*.ourbit.com/*/exchange/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      indodax.com
// @connect      192.168.1.170
// ==/UserScript==

(function () {
  'use strict';

  // Prevent duplicate execution
  if (window.__OURBIT_ORDERBOOK_IDR_MODAL__) return;
  window.__OURBIT_ORDERBOOK_IDR_MODAL__ = true;

  let RATE_IDR = 0;
  let PRICE_PRECISION = 2;
  const MAX_ROWS = 20;
  const REFRESH_INTERVAL = 30000;
  let lastUrl = location.href;

  // 🔍 Detect quote/base currency from URL (e.g. /exchange/BTCUSDT or /exchange/BTC_USDT -> USDT)
  function getBaseCurrency() {
    try {
      const match = location.pathname.match(/exchange\/([A-Z0-9_-]+)/i);
      if (match && match[1]) {
        const sym = match[1].toUpperCase();
        if (sym.includes('_')) return sym.split('_')[1];
        if (sym.includes('-')) return sym.split('-')[1];

        // Handles concatenated symbols like BTCUSDT, ETHUSDC, DOGEBTC, etc.
        const quotes = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'BUSD', 'IDR', 'EUR', 'TRY'];
        for (const q of quotes) {
          if (sym.endsWith(q) && sym.length > q.length) {
            return q;
          }
        }
      }
    } catch (e) { }
    return 'USDT';
  }

  let BASE = getBaseCurrency();

  const PAIR_MAP = {
    USDT: 'usdtidr',
    USDC: 'usdcidr',
    BTC: 'btcidr',
    ETH: 'ethidr',
    BNB: 'bnbidr',
  };

  // 🔢 Robust Number Parser (handles 76,685.40, 1.453810, 111.48K, etc.)
  function parseNumber(str) {
    if (!str && str !== 0) return NaN;
    str = String(str).trim();
    let mult = 1;
    const suf = str.match(/([KMB])$/i);
    if (suf) {
      const s = suf[1].toUpperCase();
      if (s === 'K') mult = 1e3;
      if (s === 'M') mult = 1e6;
      if (s === 'B') mult = 1e9;
      str = str.slice(0, -1).trim();
    }
    str = str.replace(/\u00A0/g, '').replace(/\s+/g, '');
    if (str.indexOf(',') > -1 && str.indexOf('.') > -1) {
      const lastDot = str.lastIndexOf('.');
      const lastComma = str.lastIndexOf(',');
      if (lastDot > lastComma) {
        str = str.replace(/,/g, '');
      } else {
        str = str.replace(/\./g, '').replace(/,/g, '.');
      }
    } else if (str.indexOf(',') > -1) {
      str = str.replace(/\./g, '').replace(/,/g, '.');
    }
    const m = str.match(/-?[\d]+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    const v = m ? parseFloat(m[0]) : NaN;
    return isFinite(v) ? v * mult : NaN;
  }

  const fmtIDR = (n) =>
    isFinite(n) ? Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '-';

  const fmtIDRPrice = (n) => {
    if (!isFinite(n)) return '-';
    const absN = Math.abs(n);
    if (absN < 1) {
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
    }
    if (absN < 1000) {
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  };

  // 🪟 UI Modal Creation
  const modal = document.createElement('div');
  modal.id = 'ourbit-orderbook-idr-modal';
  Object.assign(modal.style, {
    position: 'fixed',
    right: '20px',
    top: '120px',
    width: '420px',
    background: 'rgba(24, 26, 32, 0.95)',
    color: '#f0f0f0',
    border: '1px solid #363a45',
    borderRadius: '8px',
    zIndex: '999999',
    padding: '10px',
    fontFamily: 'Consolas, monospace',
    fontSize: '12px',
    resize: 'both',
    overflow: 'auto',
    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
  });

  const header = document.createElement('div');
  header.textContent = `Ourbit Orderbook → IDR (kurs 1 ${BASE})`;
  Object.assign(header.style, {
    cursor: 'move',
    fontWeight: 'bold',
    marginBottom: '6px',
    color: '#ffcc00',
    userSelect: 'none',
    borderBottom: '1px solid #363a45',
    paddingBottom: '6px',
  });

  const info = document.createElement('div');
  info.style.fontSize = '11px';
  info.style.opacity = '0.85';
  info.style.margin = '4px 0';
  info.style.color = '#00e676';
  info.textContent = `Memuat kurs ${BASE}...`;

  function makeTable(type) {
    const t = document.createElement('table');
    t.style.width = '100%';
    t.style.borderCollapse = 'collapse';
    t.style.marginBottom = '4px';
    const headBg = type === 'ask' ? '#3e2723' : '#1b5e20';
    t.innerHTML = `
      <thead>
        <tr style="background:${headBg};color:#eee;">
          <th style="text-align:left;padding:4px">price (${BASE})</th>
          <th style="text-align:right;padding:4px">price (IDR)</th>
          <th style="text-align:right;padding:4px">vol (IDR)</th>
        </tr>
      </thead>
      <tbody></tbody>`;
    return t;
  }

  const asksTable = makeTable('ask');
  const bidsTable = makeTable('bid');

  function updateHeaders() {
    modal.querySelectorAll('thead th:first-child')
      .forEach(th => th.textContent = `price (${BASE})`);
  }

  modal.append(header, asksTable, info, bidsTable);
  document.body.appendChild(modal);

  // 🖱 Draggable Header
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

    window.addEventListener('pointerup', () => (dragging = false));
  })(modal, header);

  // 💱 Fetch Exchange Rate from local server
  function updateRate() {
    const targetBase = (BASE || 'USDT').toUpperCase();
    const url = targetBase === 'USDT'
      ? 'http://192.168.1.170:5173/rates?bases=USDT'
      : `http://192.168.1.170:5173/rates?bases=${targetBase},USDT`;
    GM_xmlhttpRequest({
      method: 'GET',
      url: url,
      onload: (res) => {
        try {
          const j = JSON.parse(res.responseText);
          const rawRate = j.rates?.[targetBase] ?? j.rates?.[BASE] ?? j.rates?.USDT;
          const last = parseFloat(rawRate);
          if (last) {
            RATE_IDR = last;
            info.textContent = `1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`;
            update();
          }
        } catch (e) {
          console.warn('⚠️ [Ourbit Orderbook IDR] Error parsing response:', e);
        }
      },
      onerror: (err) => {
        console.warn('⚠️ [Ourbit Orderbook IDR] Error fetching rate:', err);
      }
    });
  }

  updateRate();
  setInterval(updateRate, REFRESH_INTERVAL);

  // 🎯 Auto Detect Precision
  function detectPrecision() {
    const selectors = [
      '[class*="headline_latestPrice"]',
      '[class*="headline_priceBox"]',
      '[class*="orderbook_bigPrice"]',
      '[class*="orderbook_newPrice"]',
      '[class*="orderbook_price"]',
      '[class*="lastPrice"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const txt = el.textContent.trim().replace(/,/g, '');
        if (txt.includes('.')) {
          const dec = txt.split('.')[1].replace(/0+$/, '').replace(/[^0-9]/g, '').length || 1;
          PRICE_PRECISION = Math.max(1, dec);
          return;
        }
      }
    }
  }

  detectPrecision();

  // 📊 Extract Orderbook Data from DOM (Ourbit DOM tableRow Structure)
  function extract(side) {
    const isAsk = side === 'ask';

    const askSelectors = [
      '[class*="orderbook_asks"]',
      '[class*="orderbook_asksWrapper"]',
      '[class*="asksWrapper"]',
      '[class*="asks"]',
    ];

    const bidSelectors = [
      '[class*="orderbook_bids"]',
      '[class*="orderbook_bidsWrapper"]',
      '[class*="bidsWrapper"]',
      '[class*="bids"]',
    ];

    const selectors = isAsk ? askSelectors : bidSelectors;
    let wrapper = null;
    for (const sel of selectors) {
      wrapper = document.querySelector(sel);
      if (wrapper) break;
    }

    if (!wrapper) return [];

    // Ourbit row selector: .orderbook_tableRow__M1cC0
    let rows = wrapper.querySelectorAll('[class*="orderbook_tableRow"], [class*="tableRow"]');
    if (!rows || rows.length === 0) {
      rows = wrapper.querySelectorAll('[class*="row"], [class*="Row"]');
    }
    if (!rows || rows.length === 0) {
      rows = Array.from(wrapper.children).filter(c => c.children.length >= 2);
    }

    const data = [];
    for (const r of Array.from(rows)) {
      if (data.length >= MAX_ROWS) break;

      // Extract price element and volume element inside orderbook_tableRow
      const priceEl = r.querySelector('[class*="orderbook_price"], [class*="price"], [class*="Price"], [class*="sell"], [class*="buy"]');
      const volEl = r.querySelector('[class*="orderbook_vol"], [class*="vol"], [class*="amount"]');

      if (!priceEl || !volEl) continue;

      const rawPrice = priceEl.textContent.trim();
      const rawVol = volEl.textContent.trim();

      const price = parseNumber(rawPrice);
      const vol = parseNumber(rawVol);

      if (!isFinite(price) || !isFinite(vol) || price <= 0) continue;

      data.push({
        rawPrice,
        price,
        idrPrice: price * RATE_IDR,
        volIDR: price * vol * RATE_IDR,
      });
    }

    // For asks, ensure cheapest ask (lowest price) is displayed at bottom
    if (isAsk && data.length > 1) {
      if (data[0].price > data[data.length - 1].price) {
        data.reverse();
      }
    }

    return data;
  }

  // 🎨 Render Table Data
  function render(tbl, data, color) {
    const body = tbl.querySelector('tbody');
    body.innerHTML = '';

    if (data.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3" style="padding:6px;text-align:center;color:#888;">Menunggu data orderbook...</td>`;
      body.appendChild(tr);
      return;
    }

    for (const r of data) {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #2a2e39';
      tr.style.cursor = 'pointer';
      tr.style.transition = 'background 0.15s';
      tr.onmouseenter = () => (tr.style.background = 'rgba(255,255,255,0.08)');
      tr.onmouseleave = () => (tr.style.background = 'transparent');

      tr.innerHTML = `
        <td style="padding:4px;text-align:left;color:${color};font-weight:bold;">
          ${r.rawPrice}
        </td>
        <td style="padding:4px;text-align:right;color:#ffd966;">
          ${fmtIDRPrice(r.idrPrice)}
        </td>
        <td style="padding:4px;text-align:right;color:#bbb;">
          ${fmtIDR(r.volIDR)}
        </td>`;

      tr.onclick = () => fillPrice(r.price);
      body.appendChild(tr);
    }
  }

  // ✍️ Helper to dispatch React/Vue native input setters
  function setInputValue(input, value) {
    try {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(input, value);
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (e) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ✍️ Click-to-Fill Price Input into Ourbit Trading Form
  function fillPrice(price) {
    const v = price.toFixed(PRICE_PRECISION);
    let filled = false;

    const affixWrappers = document.querySelectorAll('.ant-input-affix-wrapper, [class*="actions_inputWrapper"]');
    affixWrappers.forEach((wrapper) => {
      const prefix = wrapper.querySelector('.ant-input-prefix, [class*="prefix"]');
      if (prefix && /price|harga/i.test(prefix.textContent)) {
        const input = wrapper.querySelector('input');
        if (input && input.offsetParent !== null && !input.disabled) {
          setInputValue(input, v);
          filled = true;
        }
      }
    });

    if (!filled) {
      const line1Inputs = document.querySelectorAll('[class*="actions_line1"] input, [class*="actions_line"] input');
      line1Inputs.forEach((input) => {
        if (input.offsetParent !== null && !input.disabled) {
          setInputValue(input, v);
          filled = true;
        }
      });
    }

    if (!filled) {
      const genericInputs = document.querySelectorAll('input[placeholder*="Price"], input[placeholder*="Harga"], input.ant-input');
      genericInputs.forEach((input) => {
        if (input.offsetParent !== null && !input.disabled) {
          setInputValue(input, v);
          filled = true;
        }
      });
    }

    if (filled) {
      console.log(`✅ [Ourbit Orderbook IDR] Price filled: ${v}`);
    }
  }

  // 🔄 Main Update Function
  function update() {
    render(asksTable, extract('ask'), '#ff4d4f');
    render(bidsTable, extract('bid'), '#26a69a');
  }

  // ⏱️ SPA Navigation & Polling Watcher
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      BASE = getBaseCurrency();
      header.textContent = `Ourbit Orderbook → IDR (kurs 1 ${BASE})`;
      info.textContent = `Memuat kurs ${BASE}...`;
      updateHeaders();
      detectPrecision();
      updateRate();
      update();
    } else {
      update();
    }
  }, 500);

  // 👁️ DOM Mutation Observer for High-Frequency Updates
  function initObserver() {
    const root = document.querySelector('[class*="orderbook"]') || document.body;
    const observer = new MutationObserver(() => update());
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initObserver);
  } else {
    initObserver();
  }
})();

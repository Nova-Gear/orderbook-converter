// ==UserScript==
// @name         MEXC Orderbook to IDR Modal (FULL FIX)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  MEXC orderbook IDR conversion (Binance-style, fixed selectors)
// @match        https://www.mexc.com/exchange/*
// @match        https://www.mexc.com/*/exchange/*
// @match        https://www.mexc.fm/exchange/*
// @match        https://www.mexc.fm/*/exchange/*
// @match        https://*.mexc.com/exchange/*
// @match        https://*.mexc.com/*/exchange/*
// @grant        GM_xmlhttpRequest
// @connect      indodax.com
// @connect      192.168.1.170
// ==/UserScript==

(function () {
  'use strict';

  // Prevent duplicate execution
  if (window.__MEXC_ORDERBOOK_IDR_MODAL__) return;
  window.__MEXC_ORDERBOOK_IDR_MODAL__ = true;

  let RATE_IDR = 0;
  let PRICE_PRECISION = 2;
  const MAX_ROWS = 20;
  const REFRESH_INTERVAL = 30000;
  let lastUrl = location.href;

  function getBaseCurrency() {
    const m = location.pathname.match(/exchange\/([A-Z0-9]+)_([A-Z0-9]+)/i);
    return m ? m[2].toUpperCase() : 'USDT';
  }
  let BASE = getBaseCurrency();

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
    const el = document.querySelector(
      '[class*="lastPrice"], [class*="currentPrice"], [data-testid*="price"], [class*="orderbookItem"] [class*="price"]'
    );
    if (!el) return setTimeout(detectPrecision, 1500);
    const txt = el.textContent.trim();
    if (txt.includes('.')) {
      PRICE_PRECISION = txt.split('.')[1].replace(/0+$/, '').length || 1;
      console.log('✅ [MEXC] Detected precision =', PRICE_PRECISION);
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
    if (!isFinite(n) || n === null) return '-';
    const absN = Math.abs(n);
    if (absN < 0.1) {
      return n.toLocaleString('id-ID', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
    }
    if (absN < 10) {
      return n.toLocaleString('id-ID', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    }
    if (absN < 1000) {
      return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
  };

  // ======================
  // 🪟 Modal UI
  // ======================
  const style = document.createElement('style');
  style.textContent = `
    #mexc-orderbook-idr-modal,
    #mexc-orderbook-idr-modal * {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    #mexc-orderbook-idr-modal::-webkit-scrollbar,
    #mexc-orderbook-idr-modal *::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'mexc-orderbook-idr-modal';
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
    backdropFilter: 'blur(6px)',
    resize: 'both',
    overflow: 'auto',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
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
  info.style.margin = '4px 0';

  const asksTitle = document.createElement('div');
  Object.assign(asksTitle.style, { fontWeight: 'bold', color: '#ff6060', margin: '4px 0 2px' });
  asksTitle.textContent = 'ASKS';

  const bidsTitle = document.createElement('div');
  Object.assign(bidsTitle.style, { fontWeight: 'bold', color: '#60ff60', margin: '6px 0 2px' });
  bidsTitle.textContent = 'BIDS';

  function makeTable() {
    const t = document.createElement('table');
    t.style.width = '100%';
    t.style.borderCollapse = 'collapse';
    t.innerHTML = `
      <thead>
        <tr style="background:#444">
          <th style="text-align:left;padding:4px">price (${BASE})</th>
          <th style="padding:4px;text-align:right">price (IDR)</th>
          <th style="padding:4px;text-align:right">vol (IDR)</th>
        </tr>
      </thead>
      <tbody></tbody>`;
    return t;
  }

  const asksTable = makeTable();
  const bidsTable = makeTable();

  const asksWrap = document.createElement('div');
  Object.assign(asksWrap.style, {
    maxHeight: '200px',
    overflowY: 'auto',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  });
  asksWrap.appendChild(asksTable);

  const bidsWrap = document.createElement('div');
  Object.assign(bidsWrap.style, {
    maxHeight: '200px',
    overflowY: 'auto',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  });
  bidsWrap.appendChild(bidsTable);

  function updateHeaders() {
    modal.querySelectorAll('thead th:first-child')
      .forEach(th => th.textContent = `price (${BASE})`);
  }

  modal.append(header, asksTitle, asksWrap, info, bidsTitle, bidsWrap);
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
    const targetBase = (BASE || 'USDT').toUpperCase();
    const url = targetBase === 'USDT'
      ? 'http://192.168.1.170:5173/rates?bases=USDT'
      : `http://192.168.1.170:5173/rates?bases=${targetBase},USDT`;
    GM_xmlhttpRequest({
      method: 'GET',
      url: url,
      onload: res => {
        try {
          const j = JSON.parse(res.responseText || '{}');
          const rawRate = j.rates?.[targetBase] ?? j.rates?.[BASE] ?? j.rates?.USDT;
          const last = parseFloat(rawRate);
          if (last) {
            RATE_IDR = last;
            info.textContent = `1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`;
            update();
          }
        } catch (e) {
          console.warn('❌ Gagal parse kurs dari server lokal', e);
        }
      },
      onerror: err => {
        console.warn('❌ Gagal request kurs server lokal', err);
      }
    });
  }
  updateRate();
  setInterval(updateRate, REFRESH_INTERVAL);

  // ======================
  // 📊 Extract Orderbook
  // ======================
  function extract(side) {
    // 1. Cari wrapper asks / bids
    const wrapper = document.querySelector(
      side === 'ask'
        ? '[class*="asksBox"], [class*="asks"], [class*="orderbook_asksWrapper"]'
        : '[class*="bidsBox"], [class*="bids"], [class*="orderbook_bidsWrapper"]'
    );

    let rows = [];
    if (wrapper) {
      rows = Array.from(wrapper.querySelectorAll('[class*="orderbookItem"], [class*="tableRow"]'));
    }

    // 2. Fallback jika wrapper tidak terdeteksi: filter by sell/buy class
    if (rows.length === 0) {
      const allRows = Array.from(document.querySelectorAll('[class*="orderbookItem"], [class*="tableRow"]'));
      rows = allRows.filter(r => {
        const isSell = r.querySelector('[class*="sell"], [class*="Sell"]');
        const isBuy = r.querySelector('[class*="buy"], [class*="Buy"]');
        return side === 'ask' ? isSell : isBuy;
      });
    }

    const data = [];
    for (const r of rows) {
      const priceEl = r.querySelector('[class*="price"]') || r.children[0];
      const volEl = r.querySelector('[class*="amount"], [class*="vol"]') || r.children[1];
      if (!priceEl) continue;

      const price = parseNumber(priceEl.textContent);
      const vol = volEl ? parseNumber(volEl.textContent) : 0;
      if (!isFinite(price) || isNaN(price)) continue;

      data.push({
        rawPrice: priceEl.textContent.trim(),
        price,
        idrPrice: price * RATE_IDR,
        volIDR: (isFinite(vol) && !isNaN(vol)) ? price * vol * RATE_IDR : 0,
      });
    }

    data.sort((a, b) => b.price - a.price);
    return data.slice(0, MAX_ROWS);
  }

  function render(tbl, data, color, side) {
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
      tr.onclick = () => fillPrice(r.price, side);
      body.appendChild(tr);
    }
  }

  // ======================
  // ✍️ Click to Fill Price
  // ======================
  function fillPrice(price, side) {
    try {
      const v = price.toFixed(PRICE_PRECISION);
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

      const buyInput = document.querySelector('input[data-testid="spot-trade-buyPrice"]');
      const sellInput = document.querySelector('input[data-testid="spot-trade-sellPrice"]');
      const fallbackInputs = Array.from(document.querySelectorAll('input[placeholder*="Price"], input[name*="price"]'));

      const targets = [buyInput, sellInput, ...fallbackInputs].filter(Boolean);
      const uniqueTargets = [...new Set(targets)];

      uniqueTargets.forEach(input => {
        try {
          input.focus();
          if (nativeSetter) {
            nativeSetter.call(input, v);
          } else {
            input.value = v;
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (err) {
          console.warn('Failed to set input value:', err);
        }
      });
      console.log(`💡 MEXC click ${side || ''} → set price = ${v}`);
    } catch (e) {
      console.warn('⚠️ [MEXC] Error filling price:', e);
    }
  }

  function update() {
    render(asksTable, extract('ask'), '#ff6666', 'ask');
    render(bidsTable, extract('bid'), '#66ff66', 'bid');
    if (asksWrap) asksWrap.scrollTop = asksWrap.scrollHeight;
  }

  function debounce(fn, ms) {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
  const debouncedUpdate = debounce(update, 80);

  function initObserver() {
    const root =
      document.querySelector('#spot-grid-orderBookDeals') ||
      document.querySelector('[class*="orderbookDealsWrapper"]') ||
      document.querySelector('[class*="orderbookWrapper"]') ||
      document.querySelector('[class*="orderbook_tableBody"]') ||
      document.querySelector('[class*="asksBox"]')?.closest('div') ||
      document.body;

    if (!root) return setTimeout(initObserver, 1500);

    new MutationObserver(debouncedUpdate).observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    update();
    console.log('✅ [MEXC Orderbook IDR] Observer aktif');
  }

  initObserver();
})();

// ==UserScript==
// @name         Bybit Orderbook to IDR Modal (Dynamic Pair Kurs + Precision Auto)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Convert Bybit spot orderbook to IDR with dynamic base (USDT/USDC/BTC/ETH), realtime rate from Indodax, click-to-fill Bybit price input
// @match        https://www.bybit.com/*/trade/spot/*
// @match        https://www.bybit.com/trade/spot/*
// @match        https://www.bybit-global.com/*/trade/spot/*
// @match        https://www.bybit-global.com/trade/spot/*
// @match        https://*.bybit.com/trade/spot/*
// @match        https://*.bybit-global.com/trade/spot/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      indodax.com
// @connect      192.168.1.170
// ==/UserScript==

(function () {
  'use strict';

  // Prevent duplicate instances
  if (window.__BYBIT_ORDERBOOK_IDR_MODAL__) return;
  window.__BYBIT_ORDERBOOK_IDR_MODAL__ = true;

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  let RATE_IDR = 0;
  let PRICE_PRECISION = 2;
  const MAX_ROWS = 20;
  const REFRESH_INTERVAL = 30000;
  let lastUrl = location.href;

  // 🔍 Detect base currency from URL (e.g., /trade/spot/BTC/USDT -> USDT)
  function getBaseCurrency() {
    try {
      const parts = window.location.pathname.split('/');
      const spotIndex = parts.indexOf('spot');
      if (spotIndex !== -1 && spotIndex + 2 < parts.length) {
        return parts[spotIndex + 2].toUpperCase();
      }
      const match = window.location.pathname.match(/\/trade\/spot\/([A-Z0-9]+)\/([A-Z0-9]+)/i);
      if (match) return match[2].toUpperCase();
    } catch (e) { }
    return 'USDT';
  }

  let BASE = getBaseCurrency();
  console.log('🔹 [Bybit Orderbook IDR] Pair base terdeteksi:', BASE);

  // Map base currency to Indodax ticker
  const PAIR_MAP = {
    USDT: 'usdtidr',
    USDC: 'usdcidr',
    BTC: 'btcidr',
    ETH: 'ethidr',
    BNB: 'bnbidr',
  };

  function updateTableHeaders() {
    const ths = modal.querySelectorAll('thead th:first-child');
    ths.forEach((th) => (th.textContent = `price (${BASE})`));
  }

  // --- Auto precision detector ---
  function detectPrecision() {
    try {
      const el = document.querySelector('div.new-price span.price, div.orderbook-ticker .markPrice');
      if (el) {
        const txt = el.textContent.trim().replace(/,/g, '');
        const num = parseFloat(txt);
        if (isFinite(num) && txt.includes('.')) {
          const parts = txt.split('.');
          if (parts.length > 1) {
            const decimals = parts[1].replace(/0+$/, '').length;
            PRICE_PRECISION = Math.max(1, decimals);
            console.log('✅ [Bybit Orderbook IDR] Detected precision =', PRICE_PRECISION);
            return;
          }
        }
      }
      // Fallback: check store orderbook data sample price
      const store = win.__store?.spotOrderbookStore;
      if (store) {
        const data = store.getState()?.orderbookData;
        const sample = data?.buyData?.list?.[0]?.price || data?.sellData?.list?.[0]?.price;
        if (sample && String(sample).includes('.')) {
          const decimals = String(sample).split('.')[1].length;
          PRICE_PRECISION = Math.max(1, decimals);
          console.log('✅ [Bybit Orderbook IDR] Store detected precision =', PRICE_PRECISION);
          return;
        }
      }
    } catch (err) {
      console.warn('⚠️ [Bybit Orderbook IDR] Gagal deteksi precision', err);
    }
  }

  setTimeout(detectPrecision, 1500);

  // --- Helpers: parse number & formatting ---
  function parseNumber(str) {
    if (str === null || str === undefined) return NaN;
    if (typeof str === 'number') return str;
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

    str = str.replace(/\u00A0/g, '').replace(/\s+/g, '').replace(/,/g, '');
    const num = parseFloat(str);
    return isFinite(num) ? num * mult : NaN;
  }

  const fmtIDR = (n) => (isFinite(n) ? Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '-');

  const fmtIDRPrice = (n) => {
    if (!isFinite(n)) return '-';
    const absN = Math.abs(n);
    const intDigits = String(Math.floor(absN)).length;
    if (absN < 1) {
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
    }
    if (intDigits <= 4) {
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  };

  // --- Modal UI ---
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
    boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
    fontFamily: 'Consolas, monospace',
    fontSize: '12px',
    zIndex: '999999',
    padding: '10px',
    backdropFilter: 'blur(6px)',
    resize: 'both',
    overflow: 'auto',
  });

  const header = document.createElement('div');
  header.textContent = `Bybit Orderbook → IDR (kurs 1 ${BASE})`;
  Object.assign(header.style, {
    cursor: 'move',
    fontWeight: 'bold',
    paddingBottom: '6px',
    borderBottom: '1px solid #555',
    marginBottom: '8px',
    color: '#ffcc00',
    userSelect: 'none',
  });
  modal.appendChild(header);

  const asksTitle = document.createElement('div');
  Object.assign(asksTitle.style, { fontWeight: 'bold', color: '#ff6060', margin: '6px 0 2px' });
  asksTitle.textContent = 'ASKS';

  const bidsTitle = document.createElement('div');
  Object.assign(bidsTitle.style, { fontWeight: 'bold', color: '#60ff60', margin: '6px 0 2px' });
  bidsTitle.textContent = 'BIDS';

  const info = document.createElement('div');
  info.textContent = `Info kurs: 1 ${BASE} = ${RATE_IDR.toLocaleString('id-ID')} IDR`;
  Object.assign(info.style, { fontSize: '11px', opacity: '0.8', margin: '6px 0' });

  function makeTable() {
    const t = document.createElement('table');
    t.style.width = '100%';
    t.style.borderCollapse = 'collapse';
    t.innerHTML = `
      <thead>
        <tr style="background:#444;text-align:right;position:sticky;top:0;z-index:5;">
          <th style="text-align:left;padding:4px;">price (${BASE})</th>
          <th style="color:#ffd966;padding:4px;">price (IDR)</th>
          <th style="padding:4px;">vol (IDR)</th>
        </tr>
      </thead>
      <tbody></tbody>`;
    return t;
  }

  const asksTable = makeTable();
  const bidsTable = makeTable();

  const asksWrap = document.createElement('div');
  Object.assign(asksWrap.style, { maxHeight: '220px', overflowY: 'auto' });
  asksWrap.appendChild(asksTable);

  const bidsWrap = document.createElement('div');
  Object.assign(bidsWrap.style, { maxHeight: '220px', overflowY: 'auto' });
  bidsWrap.appendChild(bidsTable);

  modal.append(asksTitle, asksWrap, info, bidsTitle, bidsWrap);
  document.body.appendChild(modal);

  // --- Draggable Handler ---
  (function drag(el, handle) {
    let x, y, isDragging = false;
    handle.addEventListener('pointerdown', (e) => {
      isDragging = true;
      x = e.clientX - el.offsetLeft;
      y = e.clientY - el.offsetTop;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      el.style.left = e.clientX - x + 'px';
      el.style.top = e.clientY - y + 'px';
      el.style.right = 'auto';
    });
    window.addEventListener('pointerup', () => (isDragging = false));
  })(modal, header);

  // --- Kurs Update ---
  function updateRate() {
    const targetBase = (BASE || 'USDT').toUpperCase();
    const url = targetBase === 'USDT'
      ? 'http://192.168.1.170:5173/rates?bases=USDT'
      : `http://192.168.1.170:5173/rates?bases=${targetBase},USDT`;

    if (typeof GM_xmlhttpRequest !== 'undefined') {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        onload: (res) => {
          try {
            const json = JSON.parse(res.responseText);
            const rawRate = json.rates?.[targetBase] ?? json.rates?.[BASE] ?? json.rates?.USDT;
            const last = parseFloat(rawRate);
            if (!isNaN(last) && last > 0) {
              RATE_IDR = last;
              info.textContent = `Info kurs: 1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`;
              header.textContent = `Bybit Orderbook → IDR (kurs 1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR)`;
              update();
            } else {
              console.warn(`❌ [Bybit Orderbook IDR] Kurs untuk "${BASE}" tidak ditemukan dalam respons JSON:`, json);
            }
          } catch (err) {
            console.warn('❌ [Bybit Orderbook IDR] Gagal parse kurs dari server lokal', err);
          }
        },
        onerror: (err) => {
          console.warn('❌ [Bybit Orderbook IDR] Gagal melakukan request ke server lokal', err);
        },
      });
    }
  }

  updateRate();
  setInterval(updateRate, REFRESH_INTERVAL);

  // --- Extract Orderbook from Bybit Store ---
  function extract(side) {
    try {
      const store = win.__store?.spotOrderbookStore;
      if (!store || typeof store.getState !== 'function') return [];
      const orderbookData = store.getState().orderbookData;
      if (!orderbookData) return [];

      const rawList = side === 'ask' ? orderbookData.sellData?.list : orderbookData.buyData?.list;
      if (!Array.isArray(rawList)) return [];

      const data = [];
      for (const item of rawList) {
        const price = parseNumber(item.price);
        const vol = parseNumber(item.amount);
        if (isFinite(price) && isFinite(vol) && price > 0) {
          data.push({
            rawPrice: item.calc_price || (typeof item.price === 'number' ? item.price.toFixed(PRICE_PRECISION) : String(item.price)),
            idrPrice: price * RATE_IDR,
            volIDR: vol * price * RATE_IDR,
            price,
          });
        }
      }

      if (side === 'ask') {
        // Sort ascending to get lowest asks, take MAX_ROWS, then sort descending for display
        data.sort((a, b) => a.price - b.price);
        const sliced = data.slice(0, MAX_ROWS);
        sliced.sort((a, b) => b.price - a.price); // Lowest ask at the bottom
        return sliced;
      } else {
        // Sort descending to get highest bids on top
        data.sort((a, b) => b.price - a.price);
        return data.slice(0, MAX_ROWS);
      }
    } catch (err) {
      console.warn('⚠️ [Bybit Orderbook IDR] Error extracting orders:', err);
      return [];
    }
  }

  // --- Render Table ---
  function render(tbl, data, color, side) {
    const body = tbl.querySelector('tbody');
    body.innerHTML = '';
    for (const r of data) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:4px;text-align:left;color:${color};cursor:pointer;">${r.rawPrice}</td>
        <td style="padding:4px;text-align:right;color:#ffd966;">${fmtIDRPrice(r.idrPrice)}</td>
        <td style="padding:4px;text-align:right;">${fmtIDR(r.volIDR)}</td>`;
      tr.addEventListener('click', () => handleRowClick(side, r.price));
      body.appendChild(tr);
    }
  }

  // --- Click to Fill Bybit Price Input ---
  function handleRowClick(side, price) {
    try {
      const formatted = typeof price === 'number' ? price.toFixed(PRICE_PRECISION) : String(price);
      const inputs = [
        document.querySelector('input#orderLimitPrice'),
        document.querySelector('input[placeholder*="Harga"], input[placeholder*="Price"]'),
      ].filter(Boolean);

      inputs.forEach((input) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) {
          setter.call(input, formatted);
        } else {
          input.value = formatted;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      console.log(`💡 [Bybit Orderbook IDR] Klik ${side.toUpperCase()} → update harga Bybit = ${formatted}`);
    } catch (err) {
      console.error('⚠️ [Bybit Orderbook IDR] Gagal update input harga:', err);
    }
  }

  let lastAsksJson = '';
  let lastBidsJson = '';

  function update() {
    const asks = extract('ask');
    const bids = extract('bid');

    const asksJson = JSON.stringify(asks);
    const bidsJson = JSON.stringify(bids);

    if (asksJson !== lastAsksJson) {
      render(asksTable, asks, '#ff6666', 'ask');
      lastAsksJson = asksJson;
      asksWrap.scrollTop = asksWrap.scrollHeight; // Auto-scroll to lowest asks
    }

    if (bidsJson !== lastBidsJson) {
      render(bidsTable, bids, '#66ff66', 'bid');
      lastBidsJson = bidsJson;
    }
  }

  // --- Store Subscription & Polling ---
  function debounce(fn, ms) {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
  const debouncedUpdate = debounce(update, 80);

  let unsubscribeStore = null;
  function initStoreListener() {
    const store = win.__store?.spotOrderbookStore;
    if (store && typeof store.subscribe === 'function') {
      if (unsubscribeStore) {
        try { unsubscribeStore(); } catch (e) { }
      }
      unsubscribeStore = store.subscribe(() => {
        debouncedUpdate();
      });
      console.log('✅ [Bybit Orderbook IDR] Realtime Zustand store subscriber aktif');
      update();
    } else {
      setTimeout(initStoreListener, 1000);
    }
  }

  initStoreListener();

  // Polling fallback to ensure continuous updates even if events lag
  setInterval(update, 800);

  // --- SPA URL Watcher ---
  function watchUrlChange() {
    const current = location.href;
    if (current !== lastUrl) {
      lastUrl = current;
      console.log('🔄 [Bybit Orderbook IDR] Pair berganti, deteksi ulang...');
      BASE = getBaseCurrency();
      header.textContent = `Bybit Orderbook → IDR (kurs 1 ${BASE})`;
      info.textContent = `Memuat kurs ${BASE}...`;
      updateTableHeaders();
      detectPrecision();
      updateRate();
      initStoreListener();
      update();
    }
  }

  setInterval(watchUrlChange, 1000);

})();

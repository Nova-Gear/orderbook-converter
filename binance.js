// ==UserScript==
// @name         Binance Orderbook to IDR Modal (Dynamic Pair Kurs + Precision Auto)
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  Orderbook IDR conversion with dynamic base (USDT/BTC/ETH/BNB), realtime rate, click-to-fill Binance input
// @match        https://www.binance.com/*/trade/*
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

  function watchUrlChange() {
    const current = location.href;
    if (current !== lastUrl) {
      lastUrl = current;
      console.log('🔄 Pair berganti, deteksi ulang...');
      BASE = getBaseCurrency();
      header.textContent = `Binance Orderbook → IDR (kurs 1 ${BASE})`;
      info.textContent = `Memuat kurs ${BASE}...`;
      updateTableHeaders();
      detectPrecision();
      updateRate();
      update();
    }
  }

  // Binance SPA menggunakan pushState, jadi gunakan polling ringan
  setInterval(watchUrlChange, 1000);

  // 🔍 detect base currency dari URL (contoh: SOLV_USDT -> USDT)
  function getBaseCurrency() {
    const match = window.location.href.match(/\/trade\/([A-Z0-9]+)_([A-Z0-9]+)\?/i);
    if (!match) return 'USDT';
    return match[2].toUpperCase();
  }
  let BASE = getBaseCurrency();
  console.log('🔹 Pair base terdeteksi:', BASE);

  // map base ke ticker Indodax
  const PAIR_MAP = {
    USDT: 'usdtidr',
    BTC: 'btcidr',
    ETH: 'ethidr',
    BNB: 'bnbidr',
  };

  function updateTableHeaders() {
      const ths = modal.querySelectorAll('thead th:first-child');
      ths.forEach(th => th.textContent = `price (${BASE})`);
    }

  // --- precision detector ---
  function detectPrecision() {
    try {
      const el = document.querySelector('.orderbook-ticker .markPrice div:nth-child(2)');
      if (!el) return setTimeout(detectPrecision, 2000);
      const txt = el.textContent.trim().replace(/\./g, '').replace(/,/g, '.');
      const num = parseFloat(txt);
      if (isFinite(num)) {
        const parts = txt.split('.');
        if (parts.length > 1) {
          const decimals = parts[1].replace(/0+$/, '').length;
          PRICE_PRECISION = Math.max(1, decimals);
          console.log('✅ Detected precision =', PRICE_PRECISION);
        }
      }
    } catch (err) {
      console.warn('⚠️ Gagal deteksi precision', err);
    }
  }
  detectPrecision();

  // --- helper: parse number ---
  function parseNumber(str) {
    if (!str) return NaN;
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
    str = str.replace(/\./g, '').replace(/,/g, '.');
    const num = parseFloat(str);
    return isFinite(num) ? num * mult : NaN;
  }

  const fmtIDR = (n) => (isFinite(n) ? n.toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '-');

  // --- modal UI ---
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
    fontFamily: 'Consolas,monospace',
    fontSize: '12px',
    zIndex: 999999,
    padding: '10px',
    backdropFilter: 'blur(6px)',
  });

  const header = document.createElement('div');
  header.textContent = `Binance Orderbook → IDR (kurs 1 ${BASE})`;
  Object.assign(header.style, {
    cursor: 'move',
    fontWeight: 'bold',
    paddingBottom: '6px',
    borderBottom: '1px solid #555',
    marginBottom: '8px',
    color: '#ffcc00',
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
  Object.assign(info.style, { fontSize: '11px', opacity: '0.8', marginTop: '6px' });

  function makeTable() {
    const t = document.createElement('table');
    t.style.width = '100%';
    t.style.borderCollapse = 'collapse';
    t.innerHTML = `
      <thead>
        <tr style="background:#444;text-align:right;position:sticky;top:0;z-index:5;">
          <th style="text-align:left;padding:4px;">price (${BASE})</th>
          <th>price (IDR)</th>
          <th>vol (IDR)</th>
        </tr>
      </thead>
      <tbody></tbody>`;
    return t;
  }

  const asksTable = makeTable(), bidsTable = makeTable();
  const asksWrap = document.createElement('div');
  Object.assign(asksWrap.style, { maxHeight: '220px', overflowY: 'auto' });
  asksWrap.appendChild(asksTable);

  const bidsWrap = document.createElement('div');
  Object.assign(bidsWrap.style, { maxHeight: '220px', overflowY: 'auto' });
  bidsWrap.appendChild(bidsTable);

  modal.append(asksTitle, asksWrap, info, bidsTitle, bidsWrap);
  document.body.appendChild(modal);

  // draggable
  (function drag(el, handle) {
    let x, y, drag = false;
    handle.addEventListener('pointerdown', (e) => {
      drag = true;
      x = e.clientX - el.offsetLeft;
      y = e.clientY - el.offsetTop;
      handle.setPointerCapture(e.pointerId);
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      el.style.left = e.clientX - x + 'px';
      el.style.top = e.clientY - y + 'px';
      el.style.right = 'auto';
    });
    window.addEventListener('pointerup', () => (drag = false));
  })(modal, header);

  // --- kurs update ---
  function updateRate() {
    const ticker = PAIR_MAP[BASE] || 'usdtidr';
    GM_xmlhttpRequest({
      method: 'GET',
      url: `https://indodax.com/api/ticker/${ticker}`,
      onload: (res) => {
        try {
          const json = JSON.parse(res.responseText);
          const last = parseFloat(json.ticker?.last);
          if (!isNaN(last) && last > 1000) {
            RATE_IDR = last;
            info.textContent = `Info kurs: 1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`;
            header.textContent = `Binance Orderbook → IDR (kurs 1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR)`;
            update();
          }
        } catch (err) {
          console.warn('❌ Gagal parse kurs Indodax', err);
        }
      },
    });
  }
  updateRate();
  setInterval(updateRate, REFRESH_INTERVAL);

  // --- core extract & render ---
  function extract(side) {
    const selector =
      side === 'ask'
        ? '.orderbook-list.orderbook-ask .row-content'
        : '.orderbook-list.orderbook-bid .row-content';
    const rows = Array.from(document.querySelectorAll(selector));
    const data = [];
    for (const r of rows) {
      const d = r.querySelectorAll('div');
      if (d.length < 2) continue;
      const price = parseNumber(d[0].textContent);
      const vol = parseNumber(d[1].textContent);
      if (!isNaN(price) && !isNaN(vol)) {
        data.push({
          rawPrice: d[0].textContent.trim(),
          idrPrice: price * RATE_IDR,
          volIDR: vol * price * RATE_IDR,
          price,
        });
      }
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
        <td style="padding:4px;text-align:left;color:${color};cursor:pointer;">${r.rawPrice}</td>
        <td style="padding:4px;text-align:right">${fmtIDR(r.idrPrice)}</td>
        <td style="padding:4px;text-align:right">${fmtIDR(r.volIDR)}</td>`;
      tr.addEventListener('click', () => handleRowClick(side, r.price));
      body.appendChild(tr);
    }
  }

  function handleRowClick(side, price) {
    try {
      const formatted = price.toFixed(PRICE_PRECISION);
      const formattedDisplay = formatted.replace('.', ',');
      const buyInput =
        document.querySelector('input[id*="BUY"][name="price"], input[name="price"][id*="buy"]') ||
        document.querySelector('#FormRow-BUY-price');
      const sellInput =
        document.querySelector('input[id*="SELL"][name="price"], input[name="price"][id*="sell"]') ||
        document.querySelector('#FormRow-SELL-price');
      [buyInput, sellInput].forEach((input) => {
        if (input) {
          input.value = formattedDisplay;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      console.log(`💡 Klik ${side.toUpperCase()} → update harga BUY & SELL = ${formattedDisplay}`);
    } catch (err) {
      console.error('⚠️ Gagal update input harga:', err);
    }
  }

  function update() {
    render(asksTable, extract('ask'), '#ff6666', 'ask');
    render(bidsTable, extract('bid'), '#66ff66', 'bid');
    asksWrap.scrollTop = asksWrap.scrollHeight;
  }

  // --- observer ---
  function debounce(fn, ms) {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
  const debouncedUpdate = debounce(update, 100);

  function initObserver() {
    const cont = document.querySelector('.orderlist-container');
    if (!cont) return setTimeout(initObserver, 1500);
    const obs = new MutationObserver(debouncedUpdate);
    obs.observe(cont, { subtree: true, childList: true, characterData: true });
    update();
    console.log('✅ Realtime observer aktif (DOM + text)');
  }

  initObserver();

})();

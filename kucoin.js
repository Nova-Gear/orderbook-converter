// ==UserScript==
// @name         KuCoin Orderbook → IDR Modal (Fixed Extract + Realtime)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Mirror KuCoin orderbook to IDR, realtime DOM (data-item-type rows), click-to-fill, dynamic base + indodax rate.
// @match        https://www.kucoin.com/*/trade/*
// @grant        GM_xmlhttpRequest
// @connect      indodax.com
// ==/UserScript==

(function () {
  'use strict';

  if (window.__KUCOIN_ORDERBOOK_IDR__) return;
  window.__KUCOIN_ORDERBOOK_IDR__ = true;

  // --- config ---
  let RATE_IDR = 16500;
  let PRICE_PRECISION = 2;
  const MAX_ROWS = 20;
  const REFRESH_INTERVAL = 30000;
  const DEBOUNCE_MS = 80;
  const PAIR_MAP = { USDT: 'usdtidr', BTC: 'btcidr', ETH: 'ethidr', BNB: 'bnbidr' };

  // --- helpers: parse number for format "114,590.2" (comma thousands, dot decimal) and suffixes ---
  function parseNumber(str) {
    if (str === null || str === undefined) return NaN;
    str = String(str).trim();
    // suffix K/M/B
    let mult = 1;
    const suf = str.match(/([KMB])$/i);
    if (suf) {
      const s = suf[1].toUpperCase();
      if (s === 'K') mult = 1e3;
      if (s === 'M') mult = 1e6;
      if (s === 'B') mult = 1e9;
      str = str.slice(0, -1).trim();
    }
    // remove non-breaking spaces and trim
    str = str.replace(/\u00A0/g, '').replace(/\s+/g, '');
    // KuCoin uses comma as thousands separator and dot as decimal (e.g. "114,590.2")
    // So remove commas, keep dot
    str = str.replace(/,/g, '');
    // Now parse float
    const m = str.match(/-?[\d]+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    const v = m ? parseFloat(m[0]) : NaN;
    return isFinite(v) ? v * mult : NaN;
  }

  function fmtIDR(n) {
    return isFinite(n) ? Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '-';
  }
  // Khusus Price (IDR): jika jumlah digit integer < 3 (contoh < 100), tampilkan 2 angka di belakang koma
  const fmtIDRPrice = (n) => {
    if (!isFinite(n)) return '-';
    const absN = Math.abs(n);
    const intDigits = String(Math.floor(absN)).length; // jumlah digit bagian integer
    // Jika harga IDR < 1, tampilkan 6 angka di belakang koma
    if (absN < 1) {
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
    }
    // Jika jumlah digit integer < 4 (contoh: 123, 999), tampilkan 2 angka di belakang koma
    if (intDigits < 4) {
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    // Selebihnya tampilkan tanpa desimal
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  };

  // --- detect base from URL (KuCoin uses - between symbols) ---
  function getBaseCurrency() {
    const m = window.location.pathname.match(/\/trade\/([A-Z0-9\-]+)[\/?]?/i);
    if (!m) return 'USDT';
    const pair = m[1].toUpperCase();
    const parts = pair.split(/[^A-Z0-9]+/);
    if (parts.length >= 2) return parts[1].replace(/[^A-Z0-9]/g, '').toUpperCase();
    return 'USDT';
  }
  let BASE = getBaseCurrency();

  // --- build modal once ---
  let modal = document.getElementById('kucoin-orderbook-idr-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'kucoin-orderbook-idr-modal';
    Object.assign(modal.style, {
      position: 'fixed',
      right: '20px',
      top: '120px',
      width: '420px',
      background: 'rgba(18,18,18,0.96)',
      color: '#f0f0f0',
      border: '1px solid #444',
      borderRadius: '8px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      zIndex: 999999,
      padding: '10px',
      backdropFilter: 'blur(4px)',
      resize: 'both',
      overflow: 'auto',
    });
    document.body.appendChild(modal);
  } else {
    modal.innerHTML = '';
  }

  const header = document.createElement('div');
  header.style.cursor = 'move';
  header.style.fontWeight = 'bold';
  header.style.paddingBottom = '6px';
  header.style.borderBottom = '1px solid #444';
  header.style.marginBottom = '8px';
  header.style.color = '#ffd966';
  header.textContent = `KuCoin Orderbook → IDR (1 ${BASE})`;
  modal.appendChild(header);

  const asksTitle = document.createElement('div');
  asksTitle.textContent = 'ASKS';
  asksTitle.style.fontWeight = 'bold';
  asksTitle.style.color = '#ff6060';
  asksTitle.style.margin = '6px 0 2px';
  modal.appendChild(asksTitle);

  const asksWrap = document.createElement('div');
  Object.assign(asksWrap.style, { maxHeight: '220px', overflowY: 'auto' });
  modal.appendChild(asksWrap);

  const info = document.createElement('div');
  info.style.fontSize = '11px';
  info.style.opacity = '0.85';
  info.style.marginTop = '6px';
  info.textContent = `Info kurs: 1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`;
  modal.appendChild(info);

  const bidsTitle = document.createElement('div');
  bidsTitle.textContent = 'BIDS';
  bidsTitle.style.fontWeight = 'bold';
  bidsTitle.style.color = '#60ff60';
  bidsTitle.style.margin = '6px 0 2px';
  modal.appendChild(bidsTitle);

  const bidsWrap = document.createElement('div');
  Object.assign(bidsWrap.style, { maxHeight: '220px', overflowY: 'auto' });
  modal.appendChild(bidsWrap);

  // draggable
  (function makeDraggable(el, handle) {
    let offsetX = 0, offsetY = 0, dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      offsetX = e.clientX - el.getBoundingClientRect().left;
      offsetY = e.clientY - el.getBoundingClientRect().top;
      handle.setPointerCapture(e.pointerId);
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      el.style.left = Math.max(0, e.clientX - offsetX) + 'px';
      el.style.top = Math.max(0, e.clientY - offsetY) + 'px';
      el.style.right = 'auto';
    });
    window.addEventListener('pointerup', () => (dragging = false));
  })(modal, header);

  // --- extract rows robustly using the exact data-item-type attributes you provided ---
  function extractKucoin(side) {
    // side: 'sell' -> orderbook-list-sell, 'buy' -> orderbook-list-buy
    const containerSelector = side === 'sell' ? '.orderbook-list-sell' : '.orderbook-list-buy';
    const container = document.querySelector(containerSelector) || document.querySelector('[data-inspector="trade-orderbook-list"]') || document.body;
  
    // Ambil semua elemen dengan data-orderbook-item, lalu gabungkan berdasarkan ID yang sama
    const nodes = Array.from(container.querySelectorAll('[data-orderbook-item]'));
    const byId = new Map();
  
    for (const el of nodes) {
      const id = el.getAttribute('data-orderbook-item');
      if (!id) continue;
  
      let g = byId.get(id);
      if (!g) {
        g = { id, type: null, priceText: null, amountText: null, totalText: null };
        byId.set(id, g);
      }
  
      // Tentukan tipe side dari salah satu elemen dalam grup (sell/buy)
      const typeAttr = el.getAttribute('type') || el.closest('[type]')?.getAttribute('type') || null;
      if (typeAttr && !g.type) g.type = String(typeAttr).toLowerCase();
  
      // Cari price/amount/total baik di elemen itu sendiri maupun di anaknya
      const priceEl = el.matches('[data-item-type="price"]') ? el : el.querySelector('[data-item-type="price"]');
      const amountEl = el.matches('[data-item-type="amount"]') ? el : el.querySelector('[data-item-type="amount"]');
      const totalEl = el.matches('[data-item-type="total"]') ? el : el.querySelector('[data-item-type="total"]');
  
      if (!g.priceText && priceEl) g.priceText = priceEl.textContent.trim();
      if (!g.amountText && amountEl) g.amountText = amountEl.textContent.trim();
      if (!g.totalText) {
        if (totalEl) {
          g.totalText = totalEl.textContent.trim();
        } else if (el.getAttribute('data-item-type') === 'total') {
          // Beberapa struktur menaruh text total langsung pada elemen [data-item-type="total"] (tanpa span)
          g.totalText = el.textContent.trim();
        }
      }
    }
  
    const out = [];
    for (const g of byId.values()) {
      // Filter berdasarkan side yang diminta. Jika tidak ada type terdeteksi, kita percaya pada containerSelector.
      const t = g.type || '';
      if (side === 'sell' && t && !/sell/i.test(t)) continue;
      if (side === 'buy' && t && !/(buy|bid)/i.test(t)) continue;
  
      const price = parseNumber(g.priceText);
      const amount = parseNumber(g.amountText);
  
      if (!isNaN(price)) {
        out.push({
          rawPrice: g.priceText || '',
          rawAmount: g.amountText || '',
          rawTotal: g.totalText || '',
          price,
          amount: isNaN(amount) ? 0 : amount,
          idrPrice: price * RATE_IDR,
          volIDR: price * (isNaN(amount) ? 0 : amount) * RATE_IDR
        });
      }
    }
  
    // if no data found via data-orderbook-item (older/different render), fallback to searching price spans directly
    if (out.length === 0) {
      const priceSpans = Array.from(container.querySelectorAll('[data-item-type="price"]'));
      const unique = [];
      const seenP = new Set();
      for (const sp of priceSpans) {
        const parent = sp.closest('[data-orderbook-item]') || sp.parentElement;
        const id = parent?.getAttribute('data-orderbook-item') || parent?.textContent;
        if (!id || seenP.has(id)) continue;
        seenP.add(id);
        unique.push(parent);
      }
      for (const parent of unique.slice(0, MAX_ROWS)) {
        const priceEl = parent.querySelector('[data-item-type="price"]');
        const amountEl = parent.querySelector('[data-item-type="amount"]');
        const totalEl = parent.querySelector('[data-item-type="total"]');
        const rawPrice = priceEl ? priceEl.textContent.trim() : '';
        const rawAmount = amountEl ? amountEl.textContent.trim() : '';
        const price = parseNumber(rawPrice);
        const amount = parseNumber(rawAmount);
        if (!isNaN(price)) {
          out.push({
            rawPrice, rawAmount, rawTotal: totalEl ? totalEl.textContent.trim() : '',
            price, amount: isNaN(amount) ? 0 : amount,
            idrPrice: price * RATE_IDR,
            volIDR: price * (isNaN(amount) ? 0 : amount) * RATE_IDR
          });
        }
      }
    }
  
    // sort high→low so display consistent
    out.sort((a, b) => b.price - a.price);
    return out.slice(0, MAX_ROWS);
  }

  // --- render helper (sticky header) ---
  function createTableHTML(data, side) {
    return `
      <table style="width:100%; border-collapse:collapse;">
        <thead style="position:sticky; top:0; background:#333; z-index:3;">
          <tr style="text-align:right;">
            <th style="text-align:left; padding:6px;">price (${BASE})</th>
            <th style="color:#ffd966;">price (IDR)</th>
            <th>vol (IDR)</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(d => `
            <tr data-side="${side}" data-price="${d.rawPrice}" style="cursor:pointer;">
              <td style="padding:6px; text-align:left; color:${side==='sell' ? '#ff6666' : '#66ff66'};">${d.rawPrice}</td>
              <td style="text-align:right; color:#ffd966;">${fmtIDRPrice(d.idrPrice)}</td>
              <td style="text-align:right;">${fmtIDR(d.volIDR)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // --- click handler to fill KuCoin input (robust fallbacks) ---
  // Helper untuk format nilai sesuai format input KuCoin (ribuan titik, desimal koma)
  function formatKucoinInputValue(num, precision) {
    try {
      const p = Number.isFinite(precision) ? precision : 2;
      return Number(num).toLocaleString('id-ID', {
        minimumFractionDigits: p,
        maximumFractionDigits: p
      });
    } catch {
      return String(num);
    }
  }
  
  // Helper untuk set value agar framework (React/KuxInputNumber) menangkap perubahan
  function setNativeInputValue(el, val) {
    try {
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (proto && proto.set) {
        proto.set.call(el, val);
      } else {
        el.value = val;
      }
    } catch {
      el.value = val;
    }
  }

  function onRowClick(e) {
    const tr = e.currentTarget;
    const raw = tr.dataset.price;
    const side = tr.dataset.side || tr.getAttribute('data-side') || 'buy';
    const priceNum = parseNumber(raw);
    if (isNaN(priceNum)) return;
  
    const decimals = (typeof PRICE_PRECISION === 'number') ? PRICE_PRECISION : 2;
    const formattedForInput = formatKucoinInputValue(priceNum, decimals);
  
    // Cari form berdasarkan side
    const formSelector = side === 'sell'
      ? '[data-inspector="trade-orderForm-form-sell"]'
      : '[data-inspector="trade-orderForm-form-buy"]';
    const form = document.querySelector(formSelector);
  
    // Kandidat selector yang paling spesifik dulu (di dalam form)
    const scopedSelectors = form ? [
      '#price input.KuxInputNumber-input',
      'input.KuxInputNumber-input',
      '#price input',
    ] : [];
  
    // Fallback global kalau scoped tidak ketemu
    const globalSelectors = [
      'div#price input.KuxInputNumber-input',
      '#price input.KuxInputNumber-input',
      '#price input',
      'input.KuxInputNumber-input',
      'input[aria-label*="Price" i]',
      'input[placeholder*="Price" i]',
      'input[data-role="price-input"]',
      'input[class*="price"]',
      'input[type="text"]'
    ];
  
    let filled = false;
  
    function tryFill(el) {
      if (!el) return false;
      try {
        el.focus();
        setNativeInputValue(el, formattedForInput);
        // Beri event agar React/KuxInputNumber menangkap perubahan
        try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: formattedForInput })); } catch {}
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } catch {
        return false;
      }
    }
  
    // Prioritas: scoped dulu, lalu global
    for (const sel of scopedSelectors) {
      const el = form.querySelector(sel);
      if (tryFill(el)) { filled = true; break; }
    }
    if (!filled) {
      for (const sel of globalSelectors) {
        const el = document.querySelector(sel);
        if (tryFill(el)) { filled = true; break; }
      }
    }
  
    // Jika masih belum berhasil, coba cari input di panel buy/sell secara umum
    if (!filled) {
      const panel = side === 'sell'
        ? document.querySelector('.trade-sell, .trade-panel.sell, .sell')
        : document.querySelector('.trade-buy, .trade-panel.buy, .buy');
      const el = panel?.querySelector('input[type="text"], input[type="number"], input.KuxInputNumber-input');
      if (tryFill(el)) filled = true;
    }
  
    console.log('KuCoin row click -> set price =', formattedForInput, 'side:', side, 'filled:', filled);
  }

  // --- detect precision once by reading displayed ticker price (retry until found) ---
  function detectPrecisionOnce() {
    try {
      const candidates = [
        '.orderbook-bar .lp-price',
        '.orderbook-bar .lp-value, .orderbook-bar .lp-price',
        '.price, .last-price, .ticker .price',
        '.trade-price .value'
      ];
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el && el.textContent && /\d/.test(el.textContent)) {
          const txt = el.textContent.trim();
          // for KuCoin format, remove commas and treat dot as decimal
          const normalized = txt.replace(/,/g, '');
          if (normalized.indexOf('.') > -1) {
            const decimals = normalized.split('.')[1].replace(/0+$/, '').length;
            PRICE_PRECISION = Math.max(0, decimals);
          } else {
            PRICE_PRECISION = 0;
          }
          return;
        }
      }
    } catch (e) { /* ignore */ }
    setTimeout(detectPrecisionOnce, 1200);
  }
  detectPrecisionOnce();

  // --- update RATE via Indodax (use BASE -> PAIR_MAP) ---
  function updateRate() {
    const ticker = PAIR_MAP[BASE] || 'usdtidr';
    try {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://indodax.com/api/ticker/${ticker}`,
        onload: function (res) {
          try {
            const json = JSON.parse(res.responseText || '{}');
            const last = parseFloat(json.ticker?.last);
            if (!isNaN(last) && last > 0) {
              RATE_IDR = last;
              updateUI();
            }
          } catch (e) {
            console.warn('Failed parse indodax', e);
          }
        },
        onerror: function (err) {
          console.warn('GM_xmlhttpRequest error', err);
        }
      });
    } catch (e) {
      console.warn('GM_xmlhttpRequest not available', e);
    }
  }
  updateRate();
  setInterval(updateRate, REFRESH_INTERVAL);

  // --- render + attach listeners ---
  function updateUI() {
    try {
      const asks = extractKucoin('sell');
      const bids = extractKucoin('buy');
      asksWrap.innerHTML = createTableHTML(asks, 'sell');
      bidsWrap.innerHTML = createTableHTML(bids, 'buy');

      modal.querySelectorAll('tr[data-price]').forEach(tr => {
        tr.removeEventListener('click', onRowClick);
        tr.addEventListener('click', onRowClick);
      });

      info.textContent = `Info kurs: 1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`;
      header.textContent = `KuCoin Orderbook → IDR (1 ${BASE})`;
      asksWrap.scrollTop = asksWrap.scrollHeight;
    } catch (err) {
      console.warn('updateUI error', err);
    }
  }

  // --- observer (watch the orderbook container specifically) ---
  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
  const debouncedUpdate = debounce(updateUI, DEBOUNCE_MS);

  function initObserver() {
    const cont = document.querySelector('.orderbook-list-sell')?.parentElement || document.querySelector('[data-inspector="trade-orderbook-list"]') || document.body;
    const target = cont || document.body;
    const mo = new MutationObserver(debouncedUpdate);
    mo.observe(target, { subtree: true, childList: true, characterData: true });
    // initial render after small delay (KuCoin renders orderbook a bit later)
    setTimeout(updateUI, 300);
  }
  initObserver();

  // --- SPA URL watcher: if pair changes, update BASE, precision & rate & headers ---
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      BASE = getBaseCurrency();
      header.textContent = `KuCoin Orderbook → IDR (1 ${BASE})`;
      info.textContent = `Info kurs: 1 ${BASE} = ...`;
      detectPrecisionOnce();
      updateRate();
      updateUI();
      console.log('Detected URL change -> BASE =', BASE);
    }
  }, 800);

  // expose for debugging
  window.__KUCOIN_ORDERBOOK_IDR = { updateUI, updateRate, parseNumber, detectPrecisionOnce };

})();



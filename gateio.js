// ==UserScript==
// @name       Gate.io Orderbook → IDR Modal (Realtime, Click-to-Fill)
// @namespace    http://tampermonkey.net/
// @version      1.1.1
// @description  Convert Gate.io orderbook to IDR in a draggable modal, realtime via DOM, click row to fill input (supports base currency & indodax rate)
// @match        https://www.gate.io/trade/*
// @match        https://www.gate.com/trade/*
// @match        https://*.gate.io/trade/*
// @match        https://*.gate.com/trade/*
// @match        https://*.gate.com/*/trade/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      indodax.com
// @connect      192.168.1.170
// ==/UserScript==

(function () {
  'use strict';

  // prevent double-init
  if (window.__GATE_ORDERBOOK_IDR_MODAL__) return;
  window.__GATE_ORDERBOOK_IDR_MODAL__ = true;

  // config
  let RATE_IDR = 0; // default sementara
  let PRICE_PRECISION = 2;
  const MAX_ROWS = 20;
  const REFRESH_INTERVAL = 30000; // update kurs per 30s
  const DEBOUNCE_MS = 100;
  const PAIR_MAP = { USDT: 'usdtidr', BTC: 'btcidr', ETH: 'ethidr', BNB: 'bnbidr' };

  // util: parse number like "3,936.57" or "3.936,57" or "418.23K" or compressed notation like "0,0{8}7020"
  function parseNumber(str) {
    if (!str && str !== 0) return NaN;
    str = String(str).trim();

    // Handle compressed zero notation e.g. "0,0{8}7020" or "0.0{8}7020"
    const compactMatch = str.match(/^0[.,]0\{(\d+)\}(\d+)$/);
    if (compactMatch) {
      const zeroCount = parseInt(compactMatch[1], 10);
      const digits = compactMatch[2];
      const expanded = '0.' + '0'.repeat(zeroCount) + digits;
      return parseFloat(expanded);
    }

    // detect suffix K/M/B
    let mult = 1;
    const suf = str.match(/([KMB])$/i);
    if (suf) {
      const s = suf[1].toUpperCase();
      if (s === 'K') mult = 1e3;
      if (s === 'M') mult = 1e6;
      if (s === 'B') mult = 1e9;
      str = str.slice(0, -1).trim();
    }
    // Normalize spaces
    str = str.replace(/\u00A0/g, '').replace(/\s+/g, '');
    if (str.indexOf(',') > -1 && str.indexOf('.') > -1) {
      const lastDot = str.lastIndexOf('.');
      const lastComma = str.lastIndexOf(',');
      if (lastDot > lastComma) {
        str = str.replace(/,/g, '');
      } else {
        str = str.replace(/\./g, '').replace(/,/g, '.');
      }
    } else {
      if (str.indexOf(',') > -1) {
        str = str.replace(/\./g, '').replace(/,/g, '.');
      }
    }
    const m = str.match(/-?[\d]+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    const v = m ? parseFloat(m[0]) : NaN;
    return isFinite(v) ? v * mult : NaN;
  }

  const fmtIDR = (n) => (isFinite(n) ? Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '-');

  // Khusus Price (IDR): format sesuai jumlah digit
  const fmtIDRPrice = (n) => {
    if (!isFinite(n)) return '-';
    const absN = Math.abs(n);
    const intDigits = String(Math.floor(absN)).length;
    if (absN < 1) {
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 8, maximumFractionDigits: 12 });
    }
    if (intDigits < 4) {
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  };

  // detect BASE from URL: /trade/PAIR_QUOTE (e.g. BTC_USDT -> quote currency = USDT)
  function getBaseCurrency() {
    try {
      const match = window.location.pathname.match(/\/trade\/([A-Z0-9]+)_([A-Z0-9]+)/i);
      if (match && match[2]) return match[2].toUpperCase();
    } catch (e) { }
    return 'USDT';
  }
  let BASE = getBaseCurrency();

  // create single modal (avoid duplicates)
  let modal = document.getElementById('gate-orderbook-idr-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'gate-orderbook-idr-modal';
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
      zIndex: 999999,
      padding: '10px',
      backdropFilter: 'blur(6px)',
      resize: 'both',
      overflow: 'auto',
    });
    document.body.appendChild(modal);
  }

  // header / info
  const header = document.createElement('div');
  header.style.cursor = 'move';
  header.style.fontWeight = 'bold';
  header.style.paddingBottom = '6px';
  header.style.borderBottom = '1px solid #555';
  header.style.marginBottom = '8px';
  header.style.color = '#ffcc00';
  header.textContent = `Gate.io Orderbook → IDR (1 ${BASE})`;
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

  // draggable modal
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

  // Selector Helpers for Gate.io Orderbook DOM
  function getAskRows() {
    let rows = Array.from(document.querySelectorAll('[class*="listItem-"][class*="hoverTipsAsks"], [class*="listWrapReversed"] [class*="listItem-"]'));
    if (!rows.length) {
      const container = document.querySelector('[class*="listWrapReversed"]');
      if (container) {
        rows = Array.from(container.querySelectorAll('[class*="listItem-"]'));
      }
    }
    if (!rows.length) {
      rows = Array.from(document.querySelectorAll('[class*="listItem-"]')).filter(r => r.querySelector('[class*="ask-"]'));
    }
    if (!rows.length) {
      rows = Array.from(document.querySelectorAll('div.depth-list-item[type="asks"]'));
    }
    return rows;
  }

  function getBidRows() {
    let rows = Array.from(document.querySelectorAll('[class*="listItem-"][class*="hoverTipsBids"]'));
    if (!rows.length) {
      const containers = Array.from(document.querySelectorAll('[class*="listWrap-"]')).filter(c => !c.className.includes('listWrapReversed'));
      if (containers.length > 0) {
        rows = Array.from(containers[0].querySelectorAll('[class*="listItem-"]'));
      }
    }
    if (!rows.length) {
      rows = Array.from(document.querySelectorAll('[class*="listItem-"]')).filter(r => r.querySelector('[class*="bid-"]'));
    }
    if (!rows.length) {
      rows = Array.from(document.querySelectorAll('div.depth-list-item[type="bids"]'));
    }
    return rows;
  }

  function extractRowData(node) {
    const priceEl = node.querySelector('[class*="price-"], [class*="ask-"], [class*="bid-"]');
    const amountEl = node.querySelector('[class*="amount-"]');
    const totalEl = node.querySelector('[class*="totalText-"], [class*="total-"], .bTamIW');

    let priceRaw = priceEl ? priceEl.textContent.trim() : '';
    let qtyRaw = amountEl ? amountEl.textContent.trim() : '';
    let volRaw = totalEl ? totalEl.textContent.trim() : '';

    // fallback to child elements index if class query failed
    if (!priceRaw || !qtyRaw) {
      const childDivs = Array.from(node.children).filter(el => el.tagName === 'DIV' || el.tagName === 'SPAN');
      if (childDivs.length >= 2) {
        if (!priceRaw) priceRaw = childDivs[0].textContent.trim();
        if (!qtyRaw) qtyRaw = childDivs[1].textContent.trim();
        if (!volRaw && childDivs[2]) volRaw = childDivs[2].textContent.trim();
      }
    }
    return { priceRaw, qtyRaw, volRaw };
  }

  // extract orderbook from Gate DOM
  function extractGateOrders(side) {
    const nodes = side === 'asks' ? getAskRows() : getBidRows();
    const out = [];
    for (const node of nodes.slice(0, MAX_ROWS)) {
      const { priceRaw, qtyRaw, volRaw } = extractRowData(node);
      const price = parseNumber(priceRaw);
      const qty = parseNumber(qtyRaw);
      if (!isNaN(price) && !isNaN(qty)) {
        out.push({
          rawPrice: priceRaw,
          price,
          qty,
          volRaw,
          volIDR: price * qty * RATE_IDR,
          idrPrice: price * RATE_IDR,
        });
      }
    }
    out.sort((a, b) => b.price - a.price);
    return out;
  }

  // render helpers
  function createTableHTML(data, side) {
    if (!data.length) {
      return `<div style="padding: 10px; text-align: center; color: #888;">Menunggu data ${side}...</div>`;
    }
    return `
      <table style="width:100%; border-collapse:collapse;">
        <thead style="position:sticky; top:0; background:#444; z-index:2;">
          <tr style="text-align:right;">
            <th style="text-align:left; padding:6px;">price (${BASE})</th>
            <th style="color:#ffd966;">price (IDR)</th>
            <th>vol (IDR)</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(d => `
            <tr data-side="${side}" data-price="${d.rawPrice}" style="cursor:pointer;">
              <td style="padding:6px; text-align:left; color:${side === 'asks' ? '#ff6666' : '#66ff66'};">${d.rawPrice}</td>
              <td style="text-align:right; color:#ffd966;">${fmtIDRPrice(d.idrPrice)}</td>
              <td style="text-align:right;">${fmtIDR(d.volIDR)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  // update UI
  function updateUI() {
    try {
      const asks = extractGateOrders('asks');
      const bids = extractGateOrders('bids');
      asksWrap.innerHTML = createTableHTML(asks, 'asks');
      bidsWrap.innerHTML = createTableHTML(bids, 'bids');
      // attach click listeners
      modal.querySelectorAll('tr[data-price]').forEach(tr => {
        tr.removeEventListener('click', onRowClick);
        tr.addEventListener('click', onRowClick);
      });
      info.textContent = `Info kurs: 1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`;
      header.textContent = `Gate.io Orderbook → IDR (1 ${BASE})`;
      asksWrap.scrollTop = asksWrap.scrollHeight;
    } catch (e) {
      console.warn('Update UI error', e);
    }
  }

  // Find price inputs on trade panel
  function findPriceInputs() {
    const inputs = [];
    // 1. Mantine wrappers labeled Price or Harga
    const wrappers = Array.from(document.querySelectorAll('.mantine-InputWrapper-root, [class*="InputWrapper-root"]'));
    for (const w of wrappers) {
      const label = w.querySelector('.mantine-InputWrapper-label, [class*="InputWrapper-label"]');
      if (label) {
        const text = label.textContent.trim().toLowerCase();
        if (text === 'price' || text === 'harga') {
          const inp = w.querySelector('input');
          if (inp) inputs.push(inp);
        }
      }
    }
    // 2. Specific trade panel inputs fallback
    if (!inputs.length) {
      const panelInputs = document.querySelectorAll('.panel-limit-price input, [class*="panel-limit"] input, .tab_body input');
      panelInputs.forEach(inp => inputs.push(inp));
    }
    // 3. Fallback placeholder
    if (!inputs.length) {
      const fallbackInputs = document.querySelectorAll('input[placeholder*="Price" i], input[placeholder*="Harga" i], input[data-testid*="price" i]');
      fallbackInputs.forEach(inp => inputs.push(inp));
    }
    return inputs;
  }

  // click handler - fill input in active tab
  function onRowClick(e) {
    const tr = e.currentTarget;
    const side = tr.dataset.side;
    const priceRaw = tr.dataset.price;
    const priceNum = parseNumber(priceRaw);
    if (isNaN(priceNum)) return;

    const formatted = priceNum.toFixed(PRICE_PRECISION);
    const targetInputs = findPriceInputs();

    targetInputs.forEach(input => {
      try {
        input.focus();
        // Trigger React internal setter
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(input, formatted);
        } else {
          input.value = formatted;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {
        console.warn('Failed to set input', err);
      }
    });

    console.log('Clicked', side, 'price set to', formatted);
  }

  // precision detection
  function detectPrecisionOnce() {
    try {
      const candidate = document.querySelector('[data-testid="tr-spot-header-price"] .font-semibold, [data-testid="tr-spot-header-price"], [class*="chartHeader_info"], .entrust_price .trade_up, .order_price .trade_up, .entrust_price, .trade-price, .price');
      if (candidate) {
        const txt = candidate.textContent.trim();
        const normalized = txt.replace(/,/g, '').trim();
        if (normalized.includes('.')) {
          const decimals = normalized.split('.')[1].replace(/[^0-9]/g, '').length;
          if (decimals >= 0) PRICE_PRECISION = Math.max(0, decimals);
          console.log('Detected PRICE_PRECISION =', PRICE_PRECISION);
          return;
        }
      }
    } catch (e) { }

    // fallback from first extracted ask/bid row
    try {
      const askRow = getAskRows()[0] || getBidRows()[0];
      if (askRow) {
        const { priceRaw } = extractRowData(askRow);
        if (priceRaw && priceRaw.includes('.')) {
          const decimals = priceRaw.split('.')[1].replace(/[^0-9]/g, '').length;
          PRICE_PRECISION = Math.max(0, decimals);
          console.log('Detected PRICE_PRECISION from orderbook =', PRICE_PRECISION);
          return;
        }
      }
    } catch (e) { }

    setTimeout(detectPrecisionOnce, 1500);
  }
  detectPrecisionOnce();

  // update RATE based on BASE via local server
  function updateRate() {
    const targetBase = (BASE || 'USDT').toUpperCase();
    const url = targetBase === 'USDT'
      ? 'http://192.168.1.170:5173/rates?bases=USDT'
      : `http://192.168.1.170:5173/rates?bases=${targetBase},USDT`;
    try {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        onload: function (res) {
          try {
            const j = JSON.parse(res.responseText || '{}');
            const rawRate = j.rates?.[targetBase] ?? j.rates?.[BASE] ?? j.rates?.USDT;
            const last = parseFloat(rawRate);
            if (!isNaN(last) && last > 0) {
              RATE_IDR = last;
              info.textContent = `Info kurs: 1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`;
              header.textContent = `Gate.io Orderbook → IDR (1 ${BASE})`;
              updateUI();
            } else {
              console.warn('❌ Kurs untuk BASE tidak ditemukan:', j);
            }
          } catch (e) {
            console.warn('Failed parse rates', e);
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

  // observe Gate orderbook DOM for changes
  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
  const debouncedUpdate = debounce(updateUI, DEBOUNCE_MS);

  function initObserver() {
    const container = document.querySelector('[class*="listWrap-"], div[type="asks"]') || document.body;
    const mo = new MutationObserver(debouncedUpdate);
    mo.observe(container, { subtree: true, childList: true, characterData: true });
    updateUI();
  }
  initObserver();

  // Watch for SPA URL change
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      BASE = getBaseCurrency();
      header.textContent = `Gate.io Orderbook → IDR (1 ${BASE})`;
      info.textContent = `Info kurs: 1 ${BASE} = ...`;
      detectPrecisionOnce();
      updateRate();
      updateUI();
      console.log('Detected URL change, new BASE =', BASE);
    }
  }, 1000);

  // expose for debugging
  window.__GATE_ORDERBOOK_IDR = {
    updateUI, updateRate, parseNumber, detectPrecisionOnce, extractGateOrders
  };

})();
// ==UserScript==
// @name         Gate.io Orderbook → IDR Modal (Realtime, Click-to-Fill)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Convert Gate.io orderbook to IDR in a draggable modal, realtime via DOM, click row to fill input (supports base currency & indodax rate)
// @match        https://www.gate.com/trade/*
// @grant        GM_xmlhttpRequest
// @connect      indodax.com
// ==/UserScript==

(function () {
  'use strict';

  // prevent double-init
  if (window.__GATE_ORDERBOOK_IDR_MODAL__) return;
  window.__GATE_ORDERBOOK_IDR_MODAL__ = true;

  // config
  let RATE_IDR = 16500; // default sementara
  let PRICE_PRECISION = 2;
  const MAX_ROWS = 20;
  const REFRESH_INTERVAL = 30000; // update kurs per 30s
  const DEBOUNCE_MS = 100;
  const PAIR_MAP = { USDT: 'usdtidr', BTC: 'btcidr', ETH: 'ethidr', BNB: 'bnbidr' };

  // util: parse number like "3,936.57" or "3.936,57" or "418.23K"
  function parseNumber(str) {
    if (!str && str !== 0) return NaN;
    str = String(str).trim();
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
    // Gate uses comma for thousands? examples show "3,936.57" (comma thousands, dot decimal) OR sometimes dot thousands + comma decimal.
    // Normalize: if both '.' and ',' exist, assume '.' thousands and ',' decimal OR vice versa depending order.
    // Simpler: remove non-breaking spaces, remove grouping chars, then replace decimal comma with dot if needed.
    str = str.replace(/\u00A0/g, '').replace(/\s+/g, '');
    // If pattern like '3,936.57' -> comma thousands, dot decimal -> remove ',' leave '.'
    // If pattern like '3.936,57' -> dot thousands, comma decimal -> remove '.' then replace ','->'.'
    if (str.indexOf(',') > -1 && str.indexOf('.') > -1) {
      // decide by position of last separators: if last '.' after last ',' => '.' decimal (so remove ',')
      const lastDot = str.lastIndexOf('.');
      const lastComma = str.lastIndexOf(',');
      if (lastDot > lastComma) {
        str = str.replace(/,/g, '');
      } else {
        str = str.replace(/\./g, '').replace(/,/g, '.');
      }
    } else {
      // only comma or only dot
      if (str.indexOf(',') > -1) {
        // treat comma as decimal
        str = str.replace(/\./g, '');
        str = str.replace(/,/g, '.');
      } else {
        // dot only => fine, remove thousands if any (we assume no thousands separator other than dot)
        // e.g. "1.234" ambiguous; keep as-is
      }
    }
    // remove any non-digit except dot and minus and exponent
    const m = str.match(/-?[\d]+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    const v = m ? parseFloat(m[0]) : NaN;
    return isFinite(v) ? v * mult : NaN;
  }

  const fmtIDR = (n) => (isFinite(n) ? Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '-');
  // Khusus Price (IDR): jika jumlah digit integer < 3 (contoh < 100), tampilkan 2 angka di belakang koma
  const fmtIDRPrice = (n) => {
    if (!isFinite(n)) return '-';
    const intDigits = String(Math.floor(Math.abs(n))).length;
    if (intDigits < 3) {
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  };

  // detect BASE from URL: /trade/SYMBOL_BASE?...
  function getBaseCurrency() {
    const match = window.location.href.match(/\/trade\/([A-Z0-9]+)_([A-Z0-9]+)(?:\?|$)/i);
    if (!match) return 'USDT';
    return match[2].toUpperCase();
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

  // asks wrap (scrollable)
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

  // extract orderbook from Gate DOM
  function extractGateOrders(side) {
    // Gate orderbook items: depth-list-item with attribute type="asks" or "bids"
    // structure per item: <div class="sc-... depth-list-item" type="asks">
    //   <div ... cutivh> PRICE </div>
    //   <div class="... ffoiCH"> QTY </div>
    //   <div class="... jXseKN"> <div class="... bTamIW"> TOTALVOL </div> ... </div>
    //
    // We'll select items with attribute type=side and read first three child divs.
    const selector = 'div.depth-list-item[type="' + side + '"]';
    const nodes = Array.from(document.querySelectorAll(selector));
    const out = [];
    for (const node of nodes.slice(0, MAX_ROWS)) {
      // find direct child price/qty/vol
      const childDivs = Array.from(node.querySelectorAll(':scope > div'));
      if (childDivs.length >= 2) {
        const priceRaw = childDivs[0].textContent.trim();
        const qtyRaw = childDivs[1].textContent.trim();
        // total vol may be inside third div (bTamIW)
        let volRaw = '';
        if (childDivs[2]) {
          const el = childDivs[2].querySelector('.bTamIW') || childDivs[2];
          volRaw = el ? el.textContent.trim() : '';
        }
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
    }
    // Gate asks likely from low->high or high->low depending DOM; to be safe, sort high->low to show consistency
    out.sort((a, b) => b.price - a.price);
    return out;
  }

  // render helpers
  function createTableHTML(data, side) {
    return `
      <table style="width:100%; border-collapse:collapse;">
        <thead style="position:sticky; top:0; background:#444; z-index:2;">
          <tr style="text-align:right;">
            <th style="text-align:left; padding:6px;">price (${BASE})</th>
            <th>price (IDR)</th>
            <th>vol (IDR)</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(d => `
            <tr data-side="${side}" data-price="${d.rawPrice}" style="cursor:pointer;">
              <td style="padding:6px; text-align:left; color:${side==='asks'?'#ff6666':'#66ff66'};">${d.rawPrice}</td>
              <td style="text-align:right;">${fmtIDRPrice(d.idrPrice)}</td>
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
        tr.removeEventListener('click', onRowClick); // safe remove before add
        tr.addEventListener('click', onRowClick);
      });
      info.textContent = `Info kurs: 1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`;
      header.textContent = `Gate.io Orderbook → IDR (1 ${BASE})`;
      // keep asks scrolled to bottom (optional)
      asksWrap.scrollTop = asksWrap.scrollHeight;
    } catch (e) {
      console.warn('Update UI error', e);
    }
  }

  // click handler - fill input in active tab (sell or buy)
  function onRowClick(e) {
    const tr = e.currentTarget;
    const side = tr.dataset.side; // 'asks' or 'bids'
    const priceRaw = tr.dataset.price;
    // convert to number
    const priceNum = parseNumber(priceRaw);
    if (isNaN(priceNum)) return;
    // format with detected precision
    const formatted = priceNum.toFixed(PRICE_PRECISION);
    const display = formatted.replace('.', ','); // Gate likely accept dot or comma; we set same format as current inputs
    // find active input in tab body: there are .tab_body .sell (or .buy) containers
    // Gate uses mantine inputs, search for input inside .tab_body .sell or .tab_body .buy
    const sellInput = document.querySelector('.tab_body .sell input[type="text"], .tab_body .sell input[ inputmode="numeric" ], .tab_body .sell input.mantine-Input-input');
    const buyInput = document.querySelector('.tab_body .buy input[type="text"], .tab_body .buy input[ inputmode="numeric" ], .tab_body .buy input.mantine-Input-input');

    // The UI may only have one of sell/buy visible depending active tab; update whichever exist
    [buyInput, sellInput].forEach(input => {
      if (input) {
        try {
          // set value and dispatch events to trigger React
          input.focus();
          input.value = formatted; // use dot as decimal for safety
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (err) {
          console.warn('Failed to set input', err);
        }
      }
    });

    console.log('Clicked', side, 'price set to', formatted);
  }

  // precision detection (from ticker area)
  function detectPrecisionOnce() {
    try {
      // try typical gate ticker area: element with class 'entrust_price' or 'trade_up' or price display
      const candidate = document.querySelector('.entrust_price .trade_up, .order_price .trade_up, .entrust_price, .trade-price, .price');
      if (candidate) {
        const txt = candidate.textContent.trim();
        const normalized = txt.replace(/\./g, '').replace(/,/g, '.').trim();
        if (normalized.indexOf('.') > -1) {
          const decimals = normalized.split('.')[1].replace(/0+$/, '').length;
          if (decimals >= 0) PRICE_PRECISION = Math.max(0, decimals);
        }
        console.log('Detected PRICE_PRECISION =', PRICE_PRECISION);
        return;
      }
    } catch (e) { /* ignore */ }
    // fallback: try markPrice like structure
    const alt = document.querySelector('.depth-list-item .sc-1206421-4, .cutivh, .erpcaZ');
    if (alt) {
      const txt = alt.textContent.trim();
      const normalized = txt.replace(/\./g, '').replace(/,/g, '.').trim();
      if (normalized.indexOf('.') > -1) {
        const decimals = normalized.split('.')[1].replace(/0+$/, '').length;
        PRICE_PRECISION = Math.max(0, decimals);
      }
    } else {
      // retry later
      setTimeout(detectPrecisionOnce, 1500);
    }
  }
  detectPrecisionOnce();

  // update RATE based on BASE via Indodax (uses GM_xmlhttpRequest to bypass CSP)
  function updateRate() {
    const ticker = PAIR_MAP[BASE] || 'usdtidr';
    try {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://indodax.com/api/ticker/${ticker}`,
        onload: function (res) {
          try {
            const j = JSON.parse(res.responseText || '{}');
            const last = parseFloat(j.ticker?.last);
            if (!isNaN(last) && last > 0) {
              RATE_IDR = last;
              info.textContent = `Info kurs: 1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`;
              header.textContent = `Gate.io Orderbook → IDR (1 ${BASE})`;
              updateUI();
            } else {
              console.warn('Indodax returned invalid last:', j);
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

  // observe Gate orderbook DOM for changes (characterData + childList)
  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
  const debouncedUpdate = debounce(updateUI, DEBOUNCE_MS);

  function initObserver() {
    // Gate orderbook container candidate
    const asksContainer = document.querySelector('div[type="asks"], .sc-1206421-1.gjPUwz, .depth-list-item');
    const container = document.querySelector('div[type="asks"]') || document.querySelector('div.flex.flex-col.h-full') || document.body;
    const target = container || document.body;
    const mo = new MutationObserver(debouncedUpdate);
    mo.observe(target, { subtree: true, childList: true, characterData: true });
    // initial update
    updateUI();
  }
  initObserver();

  // Watch for SPA URL change (Gate uses SPA nav). If BASE changes, re-detect, update rate & headers.
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
    updateUI, updateRate, parseNumber, detectPrecisionOnce
  };

})();

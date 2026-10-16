// ==UserScript==
// @name         Bitget Orderbook → IDR Modal (Realtime, Click-to-Fill)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Convert Bitget orderbook to IDR in a draggable modal, realtime via DOM, click row to fill input (supports base currency & indodax rate)
// @match        *://*.bitgetapp.com/*/spot/*
// @match        *://*.bitgetapp.com/*/trade/*
// @grant        GM_xmlhttpRequest
// @connect      indodax.com
// @connect      192.168.1.170
// ==/UserScript==

(function () {
    'use strict';

    // Prevent double-init
    if (window.__BITGET_ORDERBOOK_IDR_MODAL__) return;
    window.__BITGET_ORDERBOOK_IDR_MODAL__ = true;

    // Config
    let RATE_IDR = 0;
    let PRICE_PRECISION = 2;
    const MAX_ROWS = 20;
    const REFRESH_INTERVAL = 30000;
    const DEBOUNCE_MS = 150;
    const PAIR_MAP = { USDT: 'usdtidr', USDC: 'usdcidr', BTC: 'btcidr', ETH: 'ethidr', BGB: 'bgbidr' };

    // Util: parse number (handles K/M/B suffixes and various comma/dot formats)
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
        } else {
            if (str.indexOf(',') > -1) {
                str = str.replace(/\./g, '');
                str = str.replace(/,/g, '.');
            }
        }
        const m = str.match(/-?[\d]+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
        const v = m ? parseFloat(m[0]) : NaN;
        return isFinite(v) ? v * mult : NaN;
    }

    // Formatting helpers
    const fmtIDR = (n) => (isFinite(n) ? Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '-');
    const fmtIDRPrice = (n) => {
        if (!isFinite(n) || n === null) return '-';
        const absN = Math.abs(n);
        if (absN < 0.1) return n.toLocaleString('id-ID', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
        if (absN < 10) return n.toLocaleString('id-ID', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        if (absN < 1000) return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
    };

    // Extract base currency from URL
    function getBaseCurrency() {
        const match = window.location.href.match(/\/spot\/[A-Z0-9]*?(USDT|USDC|BGB|ETH|BTC|IDR)(?:\?|$)/i);
        if (!match) return 'USDT';
        return match[1].toUpperCase();
    }
    let BASE = getBaseCurrency();

    // Create Modal UI safely
    function createModal() {
        let modal = document.getElementById('bitget-orderbook-idr-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'bitget-orderbook-idr-modal';
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
            zIndex: 9999999, // Ekstra tinggi agar tidak tertimpa layout Bitget
            padding: '10px',
            backdropFilter: 'blur(6px)',
            resize: 'both',
            overflow: 'auto',
        });

        // Fallback jika document.body belum siap (meskipun @run-at document-end sudah dipakai)
        if (document.body) {
            document.body.appendChild(modal);
        } else {
            document.documentElement.appendChild(modal);
        }
        return modal;
    }

    const modal = createModal();

    // Modal Elements Construction
    const header = document.createElement('div');
    header.style.cursor = 'move';
    header.style.fontWeight = 'bold';
    header.style.paddingBottom = '6px';
    header.style.borderBottom = '1px solid #555';
    header.style.marginBottom = '8px';
    header.style.color = '#ffcc00';
    header.textContent = `Bitget Orderbook → IDR (1 ${BASE})`;
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

    // Make Modal Draggable
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

    // [DIUBAH] Extract orderbook dari Bitget DOM menggunakan target background bar
    function extractBitgetOrders(side) {
        const isAsk = side === 'asks';
        // Menargetkan class background depth Bitget yang lebih persisten
        const targetBgClass = isAsk ? '.bg-contentTradeSell' : '.bg-contentTradeBuy';

        // Cari semua elemen bar volume background tersebut
        const depthBars = Array.from(document.querySelectorAll(targetBgClass));

        const out = [];
        const seenPrices = new Set();

        for (const bar of depthBars) {
            // Bar tersebut berada sejajar dengan <ul> di dalam flex container
            const parentDiv = bar.parentElement;
            if (!parentDiv) continue;

            const ul = parentDiv.querySelector('ul');
            if (!ul) continue;

            // Ambil isi <li> nya
            const childElements = Array.from(ul.querySelectorAll('li'));

            if (childElements.length >= 2) {
                const priceRaw = childElements[0].textContent.trim();
                const qtyRaw = childElements[1].textContent.trim();
                const volRaw = childElements[2] ? childElements[2].textContent.trim() : '';

                const price = parseNumber(priceRaw);
                const qty = parseNumber(qtyRaw);

                if (!isNaN(price) && !isNaN(qty) && price > 0 && !seenPrices.has(price)) {
                    seenPrices.add(price);
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

        out.sort((a, b) => b.price - a.price);
        return isAsk ? out.slice(-MAX_ROWS) : out.slice(0, MAX_ROWS);
    }

    // Render HTML Table
    function createTableHTML(data, side) {
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
            <tr data-side="${side}" data-price="${d.rawPrice}" style="cursor:pointer; border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding:6px; text-align:left; color:${side === 'asks' ? '#ff6666' : '#66ff66'};">${d.rawPrice}</td>
              <td style="text-align:right; color:#ffd966;">${fmtIDRPrice(d.idrPrice)}</td>
              <td style="text-align:right;">${fmtIDR(d.volIDR)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    }

    // Update UI logic
    function updateUI() {
        try {
            const asks = extractBitgetOrders('asks');
            const bids = extractBitgetOrders('bids');
            asksWrap.innerHTML = createTableHTML(asks, 'asks');
            bidsWrap.innerHTML = createTableHTML(bids, 'bids');

            modal.querySelectorAll('tr[data-price]').forEach(tr => {
                tr.removeEventListener('click', onRowClick);
                tr.addEventListener('click', onRowClick);
            });

            info.textContent = `Info kurs: 1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`;
            header.textContent = `Bitget Orderbook → IDR (1 ${BASE})`;
        } catch (e) {
            console.warn('Bitget IDR Script - Update UI error:', e);
        }
    }

    // Click Handler to fill input
    function onRowClick(e) {
        const tr = e.currentTarget;
        const priceRaw = tr.dataset.price;
        const priceNum = parseNumber(priceRaw);
        if (isNaN(priceNum)) return;

        const formatted = priceNum.toFixed(PRICE_PRECISION);
        const inputs = document.querySelectorAll('input[type="text"], input[inputmode="decimal"], input[inputmode="numeric"]');
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

        inputs.forEach(input => {
            const isTradePanel = input.closest('[class*="trade"], [class*="order"], [class*="place"], [class*="form"], form');
            if (isTradePanel) {
                try {
                    input.focus();
                    nativeInputValueSetter.call(input, formatted);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                } catch (err) {
                    console.warn('Failed to set input', err);
                }
            }
        });
    }

    // Detect Precision dynamically
    function detectPrecisionOnce() {
        try {
            const candidate = document.querySelector('[data-testid="SpotTradeCurrentPriceButton"], .price, [class*="current-price"]');
            if (candidate) {
                const txt = candidate.textContent.trim();
                const normalized = txt.replace(/\./g, '').replace(/,/g, '.').trim();
                if (normalized.indexOf('.') > -1) {
                    const decimals = normalized.split('.')[1].replace(/0+$/, '').length;
                    if (decimals >= 0) PRICE_PRECISION = Math.max(0, decimals);
                }
            }
        } catch (e) { /* ignore */ }
    }
    detectPrecisionOnce();

    // Fetch Rate via local server
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

    // Observer
    function debounce(fn, ms) {
        let t;
        return function () { clearTimeout(t); t = setTimeout(fn, ms); };
    }
    const debouncedUpdate = debounce(updateUI, DEBOUNCE_MS);

    function initObserver() {
        const mo = new MutationObserver(debouncedUpdate);
        mo.observe(document.body, { subtree: true, childList: true, characterData: true });
        updateUI();
    }

    // Memastikan oberserver berjalan setelah DOM siap
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initObserver);
    } else {
        initObserver();
    }

    // Watch for SPA Navigation
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            BASE = getBaseCurrency();
            detectPrecisionOnce();
            updateRate();
            updateUI();
        }
    }, 1000);

})();
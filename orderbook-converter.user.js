// ==UserScript==
// @name         Universal Crypto Orderbook → IDR Converter (All-in-One)
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  Universal realtime orderbook converter to IDR for Binance, Bybit, Kraken, Crypto.com, LBank, Gate.io, KuCoin, Bitget, MEXC, Ourbit, and OKX. Dark Glassmorphism UI, click-to-fill limit price.
// @author       AntiGravity Senior Engineer
// @match        https://www.binance.com/*/trade/*
// @match        https://www.binance.com/trade/*
// @match        https://www.bybit.com/*/trade/spot/*
// @match        https://www.bybit.com/trade/spot/*
// @match        https://www.bybit-global.com/*/trade/spot/*
// @match        https://www.bybit-global.com/trade/spot/*
// @match        https://*.bybit.com/trade/spot/*
// @match        https://*.bybit-global.com/trade/spot/*
// @match        https://pro.kraken.com/app/trade/*
// @match        https://pro.kraken.com/*/app/trade/*
// @match        https://trade.kraken.com/*
// @match        https://www.kraken.com/app/trade/*
// @match        https://*.kraken.com/trade/*
// @match        https://crypto.com/exchange/trade/*
// @match        https://*.crypto.com/exchange/trade/*
// @match        https://www.lbank.com/trade/*
// @match        https://www.lbank.com/*/trade/*
// @match        https://*.lbank.com/trade/*
// @match        https://www.lbank.info/trade/*
// @match        https://*.lbank.info/trade/*
// @match        https://www.gate.io/trade/*
// @match        https://www.gate.com/trade/*
// @match        https://*.gate.io/trade/*
// @match        https://*.gate.com/trade/*
// @match        https://www.kucoin.com/*/trade/*
// @match        https://www.kucoin.com/trade/*
// @match        https://*.bitgetapp.com/*/spot/*
// @match        https://*.bitgetapp.com/*/trade/*
// @match        https://www.bitget.com/spot/*
// @match        https://www.bitget.com/*/spot/*
// @match        https://www.bitget.com/*/trade/*
// @match        https://www.mexc.com/exchange/*
// @match        https://*.mexc.com/exchange/*
// @match        https://www.mexc.fm/exchange/*
// @match        https://www.ourbit.com/exchange/*
// @match        https://*.ourbit.com/exchange/*
// @match        https://www.okx.com/trade-spot/*
// @match        https://www.okx.com/*/trade-spot/*
// @match        https://www.okx.com/trade-swap/*
// @match        https://www.okx.com/*/trade-swap/*
// @match        https://www.okx.com/trade-futures/*
// @match        https://www.okx.com/*/trade-futures/*
// @match        https://*.okx.com/trade-spot/*
// @match        https://*.okx.com/*/trade-spot/*
// @match        https://*.okx.com/trade-swap/*
// @match        https://*.okx.com/*/trade-swap/*
// @match        https://*.okx.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      indodax.com
// @connect      192.168.1.170
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // Only run in top-level window, ignore iframes (e.g. TradingView chart widgets)
  if (window.top !== window.self) return;

  // Prevent multiple executions on the same page
  if (window.__UNIVERSAL_ORDERBOOK_IDR_ACTIVE__) return;
  window.__UNIVERSAL_ORDERBOOK_IDR_ACTIVE__ = true;

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // =========================================================================
  // 🎨 Embedded Dark Glassmorphic Design System (Zero Config Required)
  // =========================================================================
  const STYLES = `
    :root {
      --ob-bg-card: rgba(14, 18, 27, 0.94);
      --ob-bg-card-header: rgba(20, 26, 40, 0.90);
      --ob-bg-surface: rgba(255, 255, 255, 0.04);
      --ob-bg-surface-hover: rgba(255, 255, 255, 0.08);
      --ob-border-subtle: rgba(255, 255, 255, 0.08);
      --ob-border-hover: rgba(255, 255, 255, 0.18);
      --ob-text-primary: #f1f5f9;
      --ob-text-secondary: #94a3b8;
      --ob-text-muted: #64748b;
      --ob-text-gold: #f59e0b;
      --ob-text-gold-light: #fde047;
      --ob-color-ask: #f6465d;
      --ob-color-bid: #0ecb81;
      --ob-font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --ob-font-mono: "JetBrains Mono", "SF Mono", "Fira Code", Consolas, monospace;
      --ob-radius-lg: 12px;
      --ob-radius-md: 8px;
      --ob-radius-sm: 4px;
      --ob-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.2);
    }
    .ob-modal {
      position: fixed;
      z-index: 999999;
      width: 430px;
      max-width: calc(100vw - 32px);
      background: var(--ob-bg-card);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border: 1px solid var(--ob-border-subtle);
      border-radius: var(--ob-radius-lg);
      box-shadow: var(--ob-shadow);
      color: var(--ob-text-primary);
      font-family: var(--ob-font-ui);
      font-size: 12px;
      line-height: 1.4;
      box-sizing: border-box;
      overflow: hidden;
      user-select: none;
    }
    .ob-modal *, .ob-modal *::before, .ob-modal *::after { box-sizing: border-box; }
    .ob-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--ob-bg-card-header);
      border-bottom: 1px solid var(--ob-border-subtle);
      cursor: grab;
      gap: 8px;
    }
    .ob-header:active { cursor: grabbing; }
    .ob-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ob-drag-grip {
      display: inline-flex;
      flex-direction: column;
      gap: 2px;
      opacity: 0.45;
      cursor: grab;
    }
    .ob-drag-grip::before, .ob-drag-grip::after {
      content: "•••";
      font-size: 8px;
      letter-spacing: 1px;
      line-height: 1;
    }
    .ob-exchange-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 6px;
      border-radius: var(--ob-radius-sm);
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: var(--ob-text-primary);
    }
    .ob-title {
      font-weight: 600;
      font-size: 12px;
      color: var(--ob-text-primary);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ob-status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ob-color-bid);
      box-shadow: 0 0 8px var(--ob-color-bid);
      display: inline-block;
      animation: ob-pulse 2s infinite ease-in-out;
    }
    .ob-status-dot--warning {
      background: var(--ob-text-gold);
      box-shadow: 0 0 8px var(--ob-text-gold);
    }
    .ob-status-dot--error {
      background: var(--ob-color-ask);
      box-shadow: 0 0 8px var(--ob-color-ask);
      animation: none;
    }
    @keyframes ob-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .ob-header-actions { display: flex; align-items: center; gap: 4px; }
    .ob-btn-icon {
      background: transparent;
      border: none;
      color: var(--ob-text-secondary);
      width: 22px;
      height: 22px;
      border-radius: var(--ob-radius-sm);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      font-size: 12px;
      transition: all 0.15s ease;
    }
    .ob-btn-icon:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--ob-text-primary);
    }
    .ob-rate-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: rgba(0, 0, 0, 0.25);
      border-bottom: 1px solid var(--ob-border-subtle);
      font-size: 11px;
    }
    .ob-rate-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--ob-text-secondary);
    }
    .ob-rate-value {
      color: var(--ob-text-gold-light);
      font-family: var(--ob-font-mono);
      font-weight: 700;
    }
    .ob-rate-source {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--ob-text-muted);
    }
    .ob-body {
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ob-section { display: flex; flex-direction: column; }
    .ob-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 2px 4px 4px 4px;
    }
    .ob-section-badge {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }
    .ob-section-badge--ask { color: var(--ob-color-ask); }
    .ob-section-badge--bid { color: var(--ob-color-bid); }
    .ob-table-scroll {
      max-height: 200px;
      overflow-y: auto;
      overflow-x: hidden;
      border-radius: var(--ob-radius-sm);
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.04);
    }
    .ob-table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--ob-font-mono);
      font-size: 11px;
    }
    .ob-table thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: #171d28;
      color: var(--ob-text-secondary);
      font-family: var(--ob-font-ui);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 4px 6px;
      border-bottom: 1px solid var(--ob-border-subtle);
      user-select: none;
    }
    .ob-table th:first-child { text-align: left; }
    .ob-table th:nth-child(2) { text-align: right; color: var(--ob-text-gold); }
    .ob-table th:last-child { text-align: right; }
    .ob-table tbody tr {
      cursor: pointer;
      transition: background 0.12s ease;
      user-select: text;
    }
    .ob-table tbody tr:hover { background: var(--ob-bg-surface-hover); }
    .ob-table tbody tr:active, .ob-table tbody tr.ob-clicked {
      animation: ob-row-flash 0.3s ease-out;
    }
    @keyframes ob-row-flash {
      0% { background: rgba(245, 158, 11, 0.3); }
      100% { background: transparent; }
    }
    .ob-table td { padding: 3px 6px; white-space: nowrap; line-height: 1.35; }
    .ob-cell-price-ask { color: var(--ob-color-ask); font-weight: 600; text-align: left; }
    .ob-cell-price-bid { color: var(--ob-color-bid); font-weight: 600; text-align: left; }
    .ob-cell-price-idr { color: var(--ob-text-gold-light); font-weight: 500; text-align: right; }
    .ob-cell-vol-idr { color: var(--ob-text-secondary); text-align: right; }
    .ob-table-empty {
      text-align: center;
      padding: 16px;
      color: var(--ob-text-muted);
      font-family: var(--ob-font-ui);
      font-style: italic;
    }
    .ob-modal--minimized { width: auto !important; min-width: 280px; }
    .ob-modal--minimized .ob-rate-bar,
    .ob-modal--minimized .ob-body { display: none !important; }
    .ob-modal--minimized .ob-header { border-bottom: none; }
    .ob-table-scroll::-webkit-scrollbar { width: 4px; }
    .ob-table-scroll::-webkit-scrollbar-track { background: transparent; }
    .ob-table-scroll::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.14);
      border-radius: 4px;
    }
    .ob-table-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.28); }
  `;

  function injectGlobalStyle() {
    if (document.getElementById('ob-universal-styles')) return;
    const style = document.createElement('style');
    style.id = 'ob-universal-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // =========================================================================
  // 🛠️ General Utilities
  // =========================================================================
  const PAIR_MAP = {
    USDT: 'usdtidr',
    USD: 'usdtidr',
    USDC: 'usdcidr',
    BTC: 'btcidr',
    ETH: 'ethidr',
    BNB: 'bnbidr',
    EUR: 'euridr',
    GBP: 'gbpidr',
    CAD: 'cadidr',
    AUD: 'audidr',
    JPY: 'jpyidr',
    CRO: 'croidr',
    BGB: 'bgbidr',
  };

  function parseNumber(str) {
    if (!str && str !== 0) return NaN;
    str = String(str).trim();

    // Compact zero notation e.g. "0.0{8}7020" or "0,0{8}7020"
    const compactMatch = str.match(/^0[.,]0\{(\d+)\}(\d+)$/);
    if (compactMatch) {
      const zeros = parseInt(compactMatch[1], 10);
      const digits = compactMatch[2];
      return parseFloat('0.' + '0'.repeat(zeros) + digits);
    }

    let multiplier = 1;
    const suffixMatch = str.match(/([KMB])$/i);
    if (suffixMatch) {
      const u = suffixMatch[1].toUpperCase();
      if (u === 'K') multiplier = 1e3;
      if (u === 'M') multiplier = 1e6;
      if (u === 'B') multiplier = 1e9;
      str = str.slice(0, -1).trim();
    }

    str = str.replace(/\u00A0/g, '').replace(/\s+/g, '');

    if (str.includes(',') && str.includes('.')) {
      if (str.lastIndexOf('.') > str.lastIndexOf(',')) {
        str = str.replace(/,/g, '');
      } else {
        str = str.replace(/\./g, '').replace(/,/g, '.');
      }
    } else if (str.includes(',')) {
      // If only comma, check if it's decimal or thousand separator
      if (/^\d+,\d{1,8}$/.test(str)) {
        str = str.replace(',', '.');
      } else {
        str = str.replace(/,/g, '');
      }
    }

    const m = str.match(/-?[\d]+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    const num = m ? parseFloat(m[0]) : NaN;
    return isFinite(num) ? num * multiplier : NaN;
  }

  function fmtIDR(n) {
    return isFinite(n) ? Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '-';
  }

  function fmtIDRPrice(n) {
    if (!isFinite(n) || n === null) return '-';
    const absVal = Math.abs(n);
    if (absVal < 0.1) {
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
    }
    if (absVal < 10) {
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
    }
    if (absVal < 1000) {
      return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  }

  // Format token price to ensure thousand separator (e.g. 81889.40 -> 81,889.40)
  function formatTokenPrice(rawPrice, price, precision) {
    if (typeof rawPrice === 'string' && rawPrice.includes(',')) {
      return rawPrice;
    }

    if (!isFinite(price) || price === null || price <= 0) {
      return rawPrice || '-';
    }

    let dec = precision !== undefined && precision !== null ? precision : 2;
    if (typeof rawPrice === 'string' && rawPrice.includes('.')) {
      dec = rawPrice.split('.')[1].length;
    }

    if (price >= 1000) {
      return price.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }

    return rawPrice || price.toFixed(dec);
  }

  function setInputValue(input, value) {
    if (!input) return;
    try {
      input.focus();
      const prev = input.value;
      input.value = value;
      if (input._valueTracker) input._valueTracker.setValue(prev);

      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(input, value);
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (err) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function requestHttp(options) {
    if (typeof GM_xmlhttpRequest !== 'undefined') {
      return GM_xmlhttpRequest(options);
    }
    fetch(options.url, { method: options.method || 'GET' })
      .then((res) => res.text())
      .then((responseText) => {
        if (options.onload) options.onload({ responseText });
      })
      .catch((err) => {
        if (options.onerror) options.onerror(err);
      });
  }

  // =========================================================================
  // 🏢 EXCHANGE ADAPTERS (Strategy Pattern)
  // =========================================================================

  // 1. KRAKEN ADAPTER
  const KrakenAdapter = {
    name: 'Kraken Pro',
    matches: (url) => url.includes('kraken.com'),
    getBaseCurrency: () => {
      const match = location.pathname.match(/\/(?:app\/)?trade\/(?:(?:margin|futures)-)?([a-z0-9]+)-([a-z0-9]+)/i);
      return match && match[2] ? match[2].toUpperCase() : 'USD';
    },
    detectPrecision: () => {
      const el = document.querySelector('div.flex.items-center.relative div.text-right, span.text-ds-negative');
      if (el && el.textContent.includes('.')) {
        return Math.max(1, el.textContent.trim().split('.')[1].replace(/0+$/, '').length);
      }
      return 2;
    },
    extract: (side) => {
      const isAsk = side === 'ask';
      const rows = Array.from(document.querySelectorAll('div.flex.items-center.relative'));
      const items = [];

      for (const row of rows) {
        const bg = row.querySelector('span[class*="bg-order-book-"]');
        if (!bg) continue;
        const rowIsAsk = bg.className.includes('negative');
        if ((isAsk && !rowIsAsk) || (!isAsk && rowIsAsk)) continue;

        const cells = Array.from(row.querySelectorAll('div.text-right, span.text-right'));
        if (cells.length < 2) continue;

        const price = parseNumber(cells[0].textContent);
        const amount = parseNumber(cells[1].textContent);
        if (isFinite(price) && price > 0) {
          items.push({ price, amount, rawPrice: cells[0].textContent.trim() });
        }
      }

      if (isAsk) {
        items.sort((a, b) => a.price - b.price);
        return items.slice(0, 20).sort((a, b) => b.price - a.price);
      }
      items.sort((a, b) => b.price - a.price);
      return items.slice(0, 20);
    },
    fillPrice: (price, precision) => {
      const val = price.toFixed(precision);
      const inputs = Array.from(document.querySelectorAll('input#price-1, input[name="price"], [data-ds-component="Input"] input'))
        .filter((i) => i && !i.disabled && i.offsetParent !== null);
      inputs.forEach((input) => setInputValue(input, val));
    },
  };

  // 2. CRYPTO.COM ADAPTER
  const CryptoComAdapter = {
    name: 'Crypto.com',
    matches: (url) => url.includes('crypto.com/exchange'),
    getBaseCurrency: () => {
      const match = location.pathname.match(/\/exchange\/trade\/(?:spot\/)?([a-z0-9]+)[_\-]([a-z0-9]+)/i);
      return match && match[2] ? match[2].toUpperCase() : 'USDT';
    },
    detectPrecision: () => {
      const el = document.querySelector('.last-price, .e-order-book-asks-list .e-list-cell--first');
      if (el && el.textContent.includes('.')) {
        return Math.max(1, el.textContent.trim().replace(/,/g, '').split('.')[1].replace(/0+$/, '').length);
      }
      return 2;
    },
    extract: (side) => {
      const isAsk = side === 'ask';
      const containerSelector = isAsk
        ? '.e-order-book-asks-list, [class*="asks-list"]'
        : '.e-order-book-bids-list, [class*="bids-list"]';
      const container = document.querySelector(containerSelector);
      let rows = container ? Array.from(container.querySelectorAll('.e-list-item, [role="row"]')) : [];

      if (rows.length === 0) {
        const allRows = Array.from(
          document.querySelectorAll('.order-book-component .e-list-item, .e-order-book .e-list-item, [role="row"].e-list-item')
        );
        rows = allRows.filter((r) => {
          if (isAsk) {
            return (
              r.closest('.e-order-book-asks-list') ||
              r.querySelector('.text-danger-default, .e-order-book-ask-vol, [class*="danger"]') !== null
            );
          }
          return (
            r.closest('.e-order-book-bids-list') ||
            r.querySelector('.text-success-default, .e-order-book-bid-vol, [class*="success"]') !== null
          );
        });
      }

      const items = [];
      for (const row of rows) {
        const priceEl =
          row.querySelector('.e-list-cell--first, [class*="list-cell--first"], .text-danger-default, .text-success-default') ||
          row.children[0];
        const qtyEl = row.querySelector('.e-order-book-quantity, [class*="quantity"]') || row.children[1];
        if (!priceEl) continue;

        const price = parseNumber(priceEl.textContent);
        const amount = qtyEl ? parseNumber(qtyEl.textContent) : 0;
        if (isFinite(price) && price > 0) {
          items.push({ price, amount, rawPrice: priceEl.textContent.trim() });
        }
      }

      if (isAsk) {
        items.sort((a, b) => a.price - b.price);
        return items.slice(0, 20).sort((a, b) => b.price - a.price);
      }
      items.sort((a, b) => b.price - a.price);
      return items.slice(0, 20);
    },
    fillPrice: (price, precision) => {
      const val = price.toFixed(precision);
      const inputs = Array.from(document.querySelectorAll('input.e-input-number-adaptive-box__input, .e-input-number-adaptive-box input'))
        .filter((i) => i && !i.disabled && i.offsetParent !== null);
      inputs.forEach((input) => setInputValue(input, val));
    },
  };

  // 3. BINANCE ADAPTER
  const BinanceAdapter = {
    name: 'Binance',
    matches: (url) => url.includes('binance.com'),
    getBaseCurrency: () => {
      const match = location.href.match(/\/trade\/([A-Z0-9]+)_([A-Z0-9]+)/i);
      return match && match[2] ? match[2].toUpperCase() : 'USDT';
    },
    detectPrecision: () => {
      const el = document.querySelector('.orderbook-list .row-content div');
      if (el && el.textContent.includes('.')) {
        return Math.max(1, el.textContent.trim().split('.')[1].length);
      }
      return 2;
    },
    extract: (side) => {
      const isAsk = side === 'ask';
      const sel = isAsk ? '.orderbook-list.orderbook-ask .row-content' : '.orderbook-list.orderbook-bid .row-content';
      const rows = Array.from(document.querySelectorAll(sel));
      const items = [];

      for (const r of rows) {
        const d = r.querySelectorAll('div');
        if (d.length < 2) continue;
        const price = parseNumber(d[0].textContent);
        const amount = parseNumber(d[1].textContent);
        if (isFinite(price) && price > 0) {
          items.push({ price, amount, rawPrice: d[0].textContent.trim() });
        }
      }

      items.sort((a, b) => b.price - a.price);
      return items.slice(0, 20);
    },
    fillPrice: (price, precision) => {
      const val = price.toFixed(precision).replace('.', ',');
      const inputs = [
        document.querySelector('input[id*="BUY"][name="price"]'),
        document.querySelector('input[id*="SELL"][name="price"]'),
      ].filter(Boolean);
      inputs.forEach((i) => setInputValue(i, val));
    },
  };

  // 4. BYBIT ADAPTER
  const BybitAdapter = {
    name: 'Bybit',
    matches: (url) => url.includes('bybit.com') || url.includes('bybit-global.com'),
    getBaseCurrency: () => {
      const parts = location.pathname.split('/');
      const spotIdx = parts.indexOf('spot');
      if (spotIdx !== -1 && spotIdx + 2 < parts.length) return parts[spotIdx + 2].toUpperCase();
      return 'USDT';
    },
    detectPrecision: () => {
      try {
        const el = document.querySelector('div.new-price span.price, div.orderbook-ticker .markPrice');
        if (el) {
          const txt = el.textContent.trim().replace(/,/g, '');
          if (txt.includes('.')) {
            return Math.max(1, txt.split('.')[1].replace(/0+$/, '').length);
          }
        }
        const store = win.__store?.spotOrderbookStore;
        if (store) {
          const sample = store.getState()?.orderbookData?.sellData?.list?.[0]?.price;
          if (sample && String(sample).includes('.')) {
            return Math.max(1, String(sample).split('.')[1].length);
          }
        }
      } catch (e) {}
      return 1;
    },
    extract: (side) => {
      try {
        const store = win.__store?.spotOrderbookStore;
        if (!store || typeof store.getState !== 'function') return [];
        const rawList = side === 'ask'
          ? store.getState().orderbookData?.sellData?.list
          : store.getState().orderbookData?.buyData?.list;
        if (!Array.isArray(rawList)) return [];

        const pPrec = BybitAdapter.detectPrecision();
        const items = [];
        for (const it of rawList) {
          const price = parseNumber(it.price);
          const amount = parseNumber(it.amount);
          if (isFinite(price) && price > 0) {
            let rawPrice = it.calc_price;
            if (!rawPrice) {
              rawPrice = typeof it.price === 'number'
                ? it.price.toLocaleString('en-US', { minimumFractionDigits: pPrec, maximumFractionDigits: pPrec })
                : String(it.price);
            }
            items.push({ price, amount, rawPrice });
          }
        }
        if (side === 'ask') {
          items.sort((a, b) => a.price - b.price);
          return items.slice(0, 20).sort((a, b) => b.price - a.price);
        }
        items.sort((a, b) => b.price - a.price);
        return items.slice(0, 20);
      } catch (e) {
        return [];
      }
    },
    fillPrice: (price, precision) => {
      const val = price.toFixed(precision);
      const inputs = [
        document.querySelector('input#orderLimitPrice'),
        document.querySelector('input[placeholder*="Price"], input[placeholder*="Harga"]'),
      ].filter(Boolean);
      inputs.forEach((i) => setInputValue(i, val));
    },
  };

  // 5. LBANK ADAPTER (100% Client-Side React Fiber + Scoped DOM - Zero API Spam)
  function getLBankFiber() {
    try {
      const candidates = document.querySelectorAll(
        '#orderbook_container, .orderlist, .order_book_list, .lbk-trading-layout-chart-orderbook, [class*="orderbook"]'
      );
      for (const el of candidates) {
        const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!fiberKey) continue;
        let current = el[fiberKey];
        let depth = 0;
        while (current && depth < 30) {
          const props = current.memoizedProps || current.pendingProps;
          if (props && (Array.isArray(props.asks) || Array.isArray(props.bids))) {
            return {
              asks: Array.isArray(props.asks) ? props.asks : [],
              bids: Array.isArray(props.bids) ? props.bids : [],
            };
          }
          current = current.return || current.child;
          depth++;
        }
      }
    } catch (e) {}
    return null;
  }

  const LBankAdapter = {
    name: 'LBank',
    matches: (url) => url.includes('lbank.com') || url.includes('lbank.info'),
    getBaseCurrency: () => {
      const m = location.pathname.match(/\/trade\/([a-z0-9]+)[_\-]([a-z0-9]+)/i);
      return m && m[2] ? m[2].toUpperCase() : 'USDT';
    },
    detectPrecision: () => {
      try {
        const el = document.querySelector('.symbol-price .last-price, [class*="last-price"], [class*="lastPrice"]');
        if (el) {
          const txt = el.textContent.trim().replace(/,/g, '');
          if (txt.includes('.')) {
            return Math.max(1, txt.split('.')[1].replace(/0+$/, '').length);
          }
        }
      } catch (e) {}
      return 2;
    },
    extract: (side) => {
      // 1. Coba React Fiber
      const fiber = getLBankFiber();
      let sourceList = [];
      if (fiber) {
        const list = side === 'ask' ? fiber.asks : fiber.bids;
        if (Array.isArray(list) && list.length > 0) sourceList = list;
      }

      // 2. Fallback ke DOM elements (Tanpa request HTTP / Zero API Call)
      if (sourceList.length === 0) {
        const domRows = Array.from(
          document.querySelectorAll(side === 'ask' ? '.orderlist .row.sell, [class*="sell"]' : '.orderlist .row.buy, [class*="buy"]')
        );
        sourceList = domRows;
      }

      const items = [];
      for (const it of sourceList) {
        let rawPrice = '';
        let rawAmount = '';

        if (Array.isArray(it)) {
          rawPrice = String(it[0] ?? '');
          rawAmount = String(it[1] ?? '');
        } else if (typeof it === 'object' && it !== null) {
          if (it.nodeType) {
            const cells = it.querySelectorAll('span, div');
            if (cells.length >= 2) {
              rawPrice = cells[0].textContent.trim();
              rawAmount = cells[1].textContent.trim();
            }
          } else {
            rawPrice = String(it.rawPrice ?? it.price ?? '');
            rawAmount = String(it.rawAmount ?? it.amount ?? it.qty ?? '');
          }
        }

        const price = parseNumber(rawPrice);
        const amount = parseNumber(rawAmount);
        if (isFinite(price) && price > 0) {
          const formattedRaw = formatTokenPrice(rawPrice, price, 2);
          items.push({ price, amount: isFinite(amount) ? amount : 0, rawPrice: formattedRaw });
        }
      }

      if (side === 'ask') {
        items.sort((a, b) => a.price - b.price);
        return items.slice(0, 20).sort((a, b) => b.price - a.price);
      }
      items.sort((a, b) => b.price - a.price);
      return items.slice(0, 20);
    },
    fillPrice: (price, precision) => {
      const val = price.toFixed(precision);
      const inputs = Array.from(document.querySelectorAll('input#price, .lbank-create-trade input[id="price"], input.lbank-input-core'))
        .filter((i) => i && !i.disabled && i.offsetParent !== null);
      inputs.forEach((i) => setInputValue(i, val));
    },
  };

  // 6. GATE.IO ADAPTER
  const GateioAdapter = {
    name: 'Gate.io',
    matches: (url) => url.includes('gate.io') || url.includes('gate.com'),
    getBaseCurrency: () => {
      const m = location.pathname.match(/\/trade\/([A-Z0-9]+)_([A-Z0-9]+)/i);
      return m && m[2] ? m[2].toUpperCase() : 'USDT';
    },
    detectPrecision: () => 2,
    extract: (side) => {
      const isAsk = side === 'ask';
      const selector = isAsk ? '[class*="ask-"], [class*="sell-"]' : '[class*="bid-"], [class*="buy-"]';
      const rows = Array.from(document.querySelectorAll(selector)).map((el) => el.closest('tr, [class*="listItem-"], div.depth-list-item')).filter(Boolean);
      const items = [];
      const seen = new Set();

      for (const r of rows) {
        const pEl = r.querySelector('[class*="price-"], [class*="ask-"], [class*="bid-"]') || r.children[0];
        const aEl = r.querySelector('[class*="amount-"]') || r.children[1];
        if (!pEl) continue;

        const price = parseNumber(pEl.textContent);
        const amount = aEl ? parseNumber(aEl.textContent) : 0;
        if (isFinite(price) && price > 0 && !seen.has(price)) {
          seen.add(price);
          items.push({ price, amount, rawPrice: pEl.textContent.trim() });
        }
      }

      items.sort((a, b) => b.price - a.price);
      return items.slice(0, 20);
    },
    fillPrice: (price, precision) => {
      const val = price.toFixed(precision);
      const inputs = Array.from(document.querySelectorAll('.mantine-InputWrapper-root input, .panel-limit-price input'))
        .filter((i) => i && !i.disabled && i.offsetParent !== null);
      inputs.forEach((i) => setInputValue(i, val));
    },
  };

  // 7. KUCOIN ADAPTER
  function cleanKuCoinText(str) {
    if (!str) return '';
    let s = String(str).trim();
    if (s.includes('≈')) s = s.split('≈')[0].trim();
    return s.replace(/\s*≈.*$/, '').trim();
  }

  const KuCoinAdapter = {
    name: 'KuCoin',
    matches: (url) => url.includes('kucoin.com'),
    getBaseCurrency: () => {
      const m = location.pathname.match(/\/trade\/([A-Z0-9]+)[_\-]([A-Z0-9]+)/i);
      return m && m[2] ? m[2].toUpperCase() : 'USDT';
    },
    detectPrecision: () => {
      try {
        const el = document.querySelector('[data-item-type="price"], .last-price');
        if (el) {
          let txt = cleanKuCoinText(el.textContent).replace(/,/g, '');
          if (txt.includes('.')) {
            return Math.max(1, txt.split('.')[1].replace(/0+$/, '').length);
          }
        }
      } catch (e) {}
      return 2;
    },
    extract: (side) => {
      const isAsk = side === 'ask';
      const containerSelector = isAsk ? '.orderbook-list-sell, [class*="sell"]' : '.orderbook-list-buy, [class*="buy"]';
      const container =
        document.querySelector(containerSelector) ||
        document.querySelector('[data-inspector="trade-orderbook-list"]') ||
        document.body;

      // 1. Grouping berdasarkan data-orderbook-item (KuCoin render architecture)
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

        const typeAttr = el.getAttribute('type') || el.closest('[type]')?.getAttribute('type') || null;
        if (typeAttr && !g.type) g.type = String(typeAttr).toLowerCase();

        const priceEl = el.matches('[data-item-type="price"]') ? el : el.querySelector('[data-item-type="price"]');
        const amountEl = el.matches('[data-item-type="amount"]') ? el : el.querySelector('[data-item-type="amount"]');
        const totalEl = el.matches('[data-item-type="total"]') ? el : el.querySelector('[data-item-type="total"]');

        if (!g.priceText && priceEl) g.priceText = cleanKuCoinText(priceEl.textContent);
        if (!g.amountText && amountEl) g.amountText = cleanKuCoinText(amountEl.textContent);
        if (!g.totalText && totalEl) g.totalText = cleanKuCoinText(totalEl.textContent);
      }

      const items = [];
      const seen = new Set();

      for (const g of byId.values()) {
        const t = g.type || '';
        if (isAsk && t && !/sell|ask/i.test(t)) continue;
        if (!isAsk && t && !/buy|bid/i.test(t)) continue;

        const price = parseNumber(g.priceText);
        const amountNum = parseNumber(g.amountText);
        const totalNum = parseNumber(g.totalText);

        // Prioritaskan amount, jika kosong/0 gunakan total (misal Total BTC 0.01403049)
        const finalAmount = isFinite(amountNum) && amountNum > 0 ? amountNum : (isFinite(totalNum) && totalNum > 0 ? totalNum : 0);

        if (isFinite(price) && price > 0 && !seen.has(price)) {
          seen.add(price);
          items.push({
            price,
            amount: finalAmount,
            rawPrice: g.priceText,
          });
        }
      }

      // 2. Secondary fallback jika byId kosong (mencari melalui parent row)
      if (items.length === 0) {
        const priceSpans = Array.from(container.querySelectorAll('[data-item-type="price"]'));
        for (const sp of priceSpans) {
          const row =
            sp.closest('[role="row"], div.flex, div[class*="row"], div[class*="Item"]') ||
            sp.parentElement?.parentElement ||
            sp.parentElement;
          if (!row) continue;

          const rawPrice = cleanKuCoinText(sp.textContent);
          const price = parseNumber(rawPrice);
          if (!isFinite(price) || price <= 0 || seen.has(price)) continue;

          const amtEl = row.querySelector('[data-item-type="amount"], [class*="amount"]');
          const totalEl = row.querySelector('[data-item-type="total"], [class*="total"]');

          const amt = amtEl ? parseNumber(cleanKuCoinText(amtEl.textContent)) : 0;
          const tot = totalEl ? parseNumber(cleanKuCoinText(totalEl.textContent)) : 0;
          const finalAmount = isFinite(amt) && amt > 0 ? amt : (isFinite(tot) && tot > 0 ? tot : 0);

          seen.add(price);
          items.push({ price, amount: finalAmount, rawPrice });
        }
      }

      if (isAsk) {
        items.sort((a, b) => a.price - b.price);
        return items.slice(0, 20).sort((a, b) => b.price - a.price);
      }
      items.sort((a, b) => b.price - a.price);
      return items.slice(0, 20);
    },
    fillPrice: (price, precision) => {
      const val = price.toFixed(precision);
      const inputs = Array.from(document.querySelectorAll('input[placeholder*="Price" i], input[data-testid*="price" i]'))
        .filter((i) => i && !i.disabled && i.offsetParent !== null);
      inputs.forEach((i) => setInputValue(i, val));
    },
  };

  // 8. BITGET ADAPTER
  const BitgetAdapter = {
    name: 'Bitget',
    matches: (url) => url.includes('bitget.com') || url.includes('bitgetapp.com'),
    getBaseCurrency: () => {
      const m = location.pathname.match(/\/(?:spot|trade)\/([A-Z0-9]+)_([A-Z0-9]+)/i);
      return m && m[2] ? m[2].toUpperCase() : 'USDT';
    },
    detectPrecision: () => 2,
    extract: (side) => {
      const isAsk = side === 'ask';
      const targetBg = isAsk ? '.bg-contentTradeSell' : '.bg-contentTradeBuy';
      const bars = Array.from(document.querySelectorAll(targetBg));
      const items = [];
      const seen = new Set();

      for (const bar of bars) {
        const ul = bar.parentElement?.querySelector('ul');
        if (!ul) continue;
        const lis = Array.from(ul.querySelectorAll('li'));
        if (lis.length < 2) continue;

        const price = parseNumber(lis[0].textContent);
        const amount = parseNumber(lis[1].textContent);
        if (isFinite(price) && price > 0 && !seen.has(price)) {
          seen.add(price);
          items.push({ price, amount, rawPrice: lis[0].textContent.trim() });
        }
      }

      items.sort((a, b) => b.price - a.price);
      return items.slice(0, 20);
    },
    fillPrice: (price, precision) => {
      const val = price.toFixed(precision);
      const inputs = Array.from(document.querySelectorAll('input[placeholder*="Price" i], input.bitget-input-price'))
        .filter((i) => i && !i.disabled && i.offsetParent !== null);
      inputs.forEach((i) => setInputValue(i, val));
    },
  };

  // 9. MEXC ADAPTER
  const MexcAdapter = {
    name: 'MEXC',
    matches: (url) => url.includes('mexc.com') || url.includes('mexc.fm'),
    getBaseCurrency: () => {
      const m = location.pathname.match(/exchange\/([A-Z0-9]+)_([A-Z0-9]+)/i);
      return m && m[2] ? m[2].toUpperCase() : 'USDT';
    },
    detectPrecision: () => {
      try {
        const el = document.querySelector(
          '[class*="lastPrice"], [class*="currentPrice"], [data-testid*="price"], [class*="orderbookItem"] [class*="price"]'
        );
        if (el) {
          const txt = el.textContent.trim().replace(/,/g, '');
          if (txt.includes('.')) {
            return Math.max(1, txt.split('.')[1].replace(/0+$/, '').length);
          }
        }
      } catch (e) {}
      return 2;
    },
    extract: (side) => {
      const isAsk = side === 'ask';
      const wrapper = document.querySelector(
        isAsk
          ? '[class*="asksBox"], [class*="asks"], [class*="orderbook_asksWrapper"], [class*="sellWrapper"]'
          : '[class*="bidsBox"], [class*="bids"], [class*="orderbook_bidsWrapper"], [class*="buyWrapper"]'
      );

      let rows = [];
      if (wrapper) {
        rows = Array.from(wrapper.querySelectorAll('[class*="orderbookItem"], [class*="tableRow"], [class*="row"]'));
      }
      if (rows.length === 0) {
        const allRows = Array.from(document.querySelectorAll('[class*="orderbookItem"], [class*="tableRow"]'));
        rows = allRows.filter((r) => {
          const isSell = r.querySelector('[class*="sell"], [class*="Sell"]');
          const isBuy = r.querySelector('[class*="buy"], [class*="Buy"]');
          return isAsk ? isSell : isBuy;
        });
      }

      const items = [];
      const seen = new Set();
      for (const r of rows) {
        const pEl = r.querySelector('[class*="price"]') || r.children[0];
        const vEl = r.querySelector('[class*="amount"], [class*="vol"]') || r.children[1];
        if (!pEl) continue;

        const rawPrice = pEl.textContent.trim();
        const price = parseNumber(rawPrice);
        const amount = vEl ? parseNumber(vEl.textContent) : 0;
        if (isFinite(price) && price > 0) {
          // Cegah baris double jika elemen DOM nested atau memiliki harga identik
          if (seen.has(price)) continue;
          seen.add(price);
          const formattedRaw = formatTokenPrice(rawPrice, price, 2);
          items.push({ price, amount: isFinite(amount) ? amount : 0, rawPrice: formattedRaw });
        }
      }

      if (isAsk) {
        items.sort((a, b) => a.price - b.price);
        return items.slice(0, 20).sort((a, b) => b.price - a.price);
      }
      items.sort((a, b) => b.price - a.price);
      return items.slice(0, 20);
    },
    fillPrice: (price, precision) => {
      const val = price.toFixed(precision);
      const inputs = [
        document.querySelector('input[data-testid="spot-trade-buyPrice"]'),
        document.querySelector('input[data-testid="spot-trade-sellPrice"]'),
        ...Array.from(document.querySelectorAll('input[placeholder*="Price" i], input[name*="price" i]')),
      ].filter((i) => i && !i.disabled && i.offsetParent !== null);
      const unique = [...new Set(inputs)];
      unique.forEach((i) => setInputValue(i, val));
    },
  };

  // 10. OURBIT ADAPTER
  const OurbitAdapter = {
    name: 'Ourbit',
    matches: (url) => url.includes('ourbit.com'),
    getBaseCurrency: () => {
      try {
        const match = location.pathname.match(/exchange\/([A-Z0-9_-]+)/i);
        if (match && match[1]) {
          const sym = match[1].toUpperCase();
          if (sym.includes('_')) return sym.split('_')[1];
          if (sym.includes('-')) return sym.split('-')[1];

          const quotes = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'BUSD', 'IDR', 'EUR', 'TRY'];
          for (const q of quotes) {
            if (sym.endsWith(q) && sym.length > q.length) {
              return q;
            }
          }
        }
      } catch (e) {}
      return 'USDT';
    },
    detectPrecision: () => {
      try {
        const el = document.querySelector('[class*="orderbook_price"], [class*="lastPrice"], [class*="currentPrice"]');
        if (el) {
          const txt = el.textContent.trim().replace(/,/g, '');
          if (txt.includes('.')) {
            return Math.max(1, txt.split('.')[1].replace(/0+$/, '').length);
          }
        }
      } catch (e) {}
      return 2;
    },
    extract: (side) => {
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

      let rows = [];
      if (wrapper) {
        rows = Array.from(wrapper.querySelectorAll('[class*="orderbook_tableRow"], [class*="tableRow"], [class*="row"]'));
        if (rows.length === 0) {
          rows = Array.from(wrapper.children).filter((c) => c.children.length >= 2);
        }
      }

      // Fallback jika wrapper tidak terdeteksi
      if (rows.length === 0) {
        const allRows = Array.from(document.querySelectorAll('[class*="orderbook_tableRow"], [class*="tableRow"]'));
        rows = allRows.filter((r) => {
          const isSell = r.querySelector('[class*="sell"], [class*="Sell"]');
          const isBuy = r.querySelector('[class*="buy"], [class*="Buy"]');
          return isAsk ? isSell : isBuy;
        });
      }

      const items = [];
      const seen = new Set();
      for (const r of rows) {
        const priceEl = r.querySelector('[class*="orderbook_price"], [class*="price"], [class*="Price"], [class*="sell"], [class*="buy"]');
        const volEl = r.querySelector('[class*="orderbook_vol"], [class*="vol"], [class*="amount"]');
        if (!priceEl) continue;

        const rawPrice = priceEl.textContent.trim();
        const price = parseNumber(rawPrice);
        const amount = volEl ? parseNumber(volEl.textContent) : 0;

        if (isFinite(price) && price > 0) {
          if (seen.has(price)) continue;
          seen.add(price);
          const formattedRaw = formatTokenPrice(rawPrice, price, 2);
          items.push({ price, amount: isFinite(amount) ? amount : 0, rawPrice: formattedRaw });
        }
      }

      if (isAsk) {
        // Cheapest asks first
        items.sort((a, b) => a.price - b.price);
        return items.slice(0, 20).sort((a, b) => b.price - a.price);
      }
      // Highest bids first
      items.sort((a, b) => b.price - a.price);
      return items.slice(0, 20);
    },
    fillPrice: (price, precision) => {
      const val = price.toFixed(precision);
      const inputs = Array.from(
        document.querySelectorAll('input[placeholder*="Price" i], input[name*="price" i], input.orderbook-price-input')
      ).filter((i) => i && !i.disabled && i.offsetParent !== null);
      inputs.forEach((i) => setInputValue(i, val));
    },
  };

  // 11. OKX ADAPTER (100% Client-Side Passive WS + React Fiber + Scoped DOM - Zero API Spam)
  let okxWsAsks = [];
  let okxWsBids = [];
  try {
    if (location.hostname.includes('okx.com') && !win.__OKX_WS_INTERCEPTED__) {
      win.__OKX_WS_INTERCEPTED__ = true;
      const OrigWS = win.WebSocket;
      if (OrigWS) {
        win.WebSocket = function (...args) {
          const ws = new OrigWS(...args);
          ws.addEventListener('message', (ev) => {
            try {
              if (typeof ev.data === 'string' && ev.data.includes('"books')) {
                const msg = JSON.parse(ev.data);
                const d = msg?.data?.[0];
                if (d) {
                  if (Array.isArray(d.asks) && d.asks.length > 0) okxWsAsks = d.asks;
                  if (Array.isArray(d.bids) && d.bids.length > 0) okxWsBids = d.bids;
                }
              }
            } catch (e) {}
          });
          return ws;
        };
        win.WebSocket.prototype = OrigWS.prototype;
      }
    }
  } catch (e) {}

  function getOkxFiber() {
    try {
      const candidates = document.querySelectorAll(
        '[data-qa*="order-book"], [class*="orderBook" i], [class*="order-book" i], .order-book, .okui-table'
      );
      for (const el of candidates) {
        const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!fiberKey) continue;
        let current = el[fiberKey];
        let depth = 0;
        while (current && depth < 30) {
          const props = current.memoizedProps || current.pendingProps;
          if (props && (Array.isArray(props.asks) || Array.isArray(props.bids))) {
            return {
              asks: Array.isArray(props.asks) ? props.asks : [],
              bids: Array.isArray(props.bids) ? props.bids : [],
            };
          }
          current = current.return || current.child;
          depth++;
        }
      }
    } catch (e) {}
    return null;
  }

  const OkxAdapter = {
    name: 'OKX',
    matches: (url) => url.includes('okx.com'),
    getBaseCurrency: () => {
      try {
        const m = location.pathname.match(/trade-(?:spot|swap|futures)\/([a-z0-9_\-]+)/i);
        if (m && m[1]) {
          const parts = m[1].toUpperCase().split('-');
          if (parts.length >= 2) {
            return parts[1];
          }
        }
      } catch (e) {}
      return 'USDT';
    },
    detectPrecision: () => {
      try {
        const el = document.querySelector(
          '.idx-current-price, [class*="lastPrice"], [class*="currentPrice"], [data-testid*="price"], .okui-input-input[placeholder*="Price" i]'
        );
        if (el) {
          const txt = (el.value || el.textContent).trim().replace(/,/g, '');
          if (txt.includes('.')) {
            return Math.max(1, txt.split('.')[1].replace(/0+$/, '').length);
          }
        }
      } catch (e) {}
      return 2;
    },
    extract: (side) => {
      const isAsk = side === 'ask';

      // 1. Coba Passive WebSocket data yang sudah diterima tab browser
      let sourceList = isAsk ? okxWsAsks : okxWsBids;

      // 2. Coba React Fiber internal instance
      if (!sourceList || sourceList.length === 0) {
        const fiber = getOkxFiber();
        if (fiber) {
          const list = isAsk ? fiber.asks : fiber.bids;
          if (Array.isArray(list) && list.length > 0) sourceList = list;
        }
      }

      // 3. Fallback ke Scoped DOM elements (100% Client-Side - Zero API Spam)
      if (!sourceList || sourceList.length === 0) {
        const askWrapper = document.querySelector(
          '[data-qa*="order-book-asks"], [class*="order-book-asks"], [class*="orderbook-asks"], [class*="asks-list"], [class*="asksBox"], [class*="asks" i]'
        );
        const bidWrapper = document.querySelector(
          '[data-qa*="order-book-bids"], [class*="order-book-bids"], [class*="orderbook-bids"], [class*="bids-list"], [class*="bidsBox"], [class*="bids" i]'
        );
        const targetWrapper = isAsk ? askWrapper : bidWrapper;
        if (targetWrapper) {
          sourceList = Array.from(targetWrapper.querySelectorAll('[class*="row" i], [class*="item" i], div[role="row"], li'));
        }
      }

      const items = [];
      const seen = new Set();
      for (const it of sourceList) {
        let rawPrice = '';
        let rawAmount = '';

        if (Array.isArray(it)) {
          rawPrice = String(it[0] ?? '');
          rawAmount = String(it[1] ?? '');
        } else if (typeof it === 'object' && it !== null) {
          if (it.nodeType) {
            const pEl = it.querySelector('[class*="price"], span:first-child');
            const vEl = it.querySelector('[class*="amount"], [class*="size"], span:nth-child(2)');
            if (pEl) rawPrice = pEl.textContent.trim();
            if (vEl) rawAmount = vEl.textContent.trim();
          } else {
            rawPrice = String(it.price ?? '');
            rawAmount = String(it.amount ?? it.sz ?? '');
          }
        }

        const price = parseNumber(rawPrice);
        const amount = parseNumber(rawAmount);
        if (isFinite(price) && price > 0) {
          if (seen.has(price)) continue;
          seen.add(price);
          const formattedRaw = formatTokenPrice(rawPrice, price, 2);
          items.push({ price, amount: isFinite(amount) ? amount : 0, rawPrice: formattedRaw });
        }
      }

      if (isAsk) {
        items.sort((a, b) => a.price - b.price);
        return items.slice(0, 20).sort((a, b) => b.price - a.price);
      }
      items.sort((a, b) => b.price - a.price);
      return items.slice(0, 20);
    },
    fillPrice: (price, precision) => {
      const val = price.toFixed(precision);
      const inputs = Array.from(
        document.querySelectorAll(
          'input.okui-input-input[placeholder*="Price" i], input[placeholder*="Price" i], input[data-qa*="price" i], input[name*="price" i]'
        )
      ).filter((i) => i && !i.disabled && i.offsetParent !== null);
      inputs.forEach((i) => setInputValue(i, val));
    },
  };

  // Registry of all adapters
  const ADAPTERS = [
    KrakenAdapter,
    CryptoComAdapter,
    BinanceAdapter,
    BybitAdapter,
    LBankAdapter,
    GateioAdapter,
    KuCoinAdapter,
    BitgetAdapter,
    MexcAdapter,
    OurbitAdapter,
    OkxAdapter,
  ];

  function getActiveAdapter() {
    const url = location.href;
    return ADAPTERS.find((a) => a.matches(url)) || null;
  }

  // =========================================================================
  // 🚀 Core Application Orchestrator
  // =========================================================================
  const adapter = getActiveAdapter();
  if (!adapter) {
    console.log('ℹ️ [Universal Orderbook] Tidak ada exchange yang cocok untuk domain ini.');
    return;
  }

  console.log(`🚀 [Universal Orderbook] Exchange terdeteksi: ${adapter.name}`);
  injectGlobalStyle();

  // Storage key for position & collapse state
  const storageKey = `ob_modal_pos_${adapter.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  let savedPref = { left: null, top: null, isMinimized: false };
  try {
    savedPref = JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch (e) { }

  let BASE = adapter.getBaseCurrency() || 'USDT';
  let RATE_IDR = 0;
  let precision = adapter.detectPrecision ? adapter.detectPrecision() : 2;

  // Build Unified DOM
  const modal = document.createElement('div');
  modal.className = `ob-modal ${savedPref.isMinimized ? 'ob-modal--minimized' : ''}`;
  modal.id = `ob-modal-${adapter.name.toLowerCase().replace(/\s+/g, '-')}`;

  if (savedPref.left && savedPref.top) {
    modal.style.left = savedPref.left;
    modal.style.top = savedPref.top;
    modal.style.right = 'auto';
  } else {
    modal.style.right = '20px';
    modal.style.top = '120px';
  }

  modal.innerHTML = `
    <div class="ob-header">
      <div class="ob-header-left">
        <span class="ob-drag-grip" title="Tahan & geser untuk memindahkan"></span>
        <span class="ob-exchange-badge">${adapter.name}</span>
        <span class="ob-title">
          <span class="ob-status-dot"></span>
          <span class="ob-title-text">${BASE} → IDR</span>
        </span>
      </div>
      <div class="ob-header-actions">
        <button class="ob-btn-icon ob-btn-refresh" title="Perbarui Kurs">↻</button>
        <button class="ob-btn-icon ob-btn-minimize" title="${savedPref.isMinimized ? 'Perbesar' : 'Perkecil'}">
          ${savedPref.isMinimized ? '▢' : '—'}
        </button>
        <button class="ob-btn-icon ob-btn-close" title="Tutup">✕</button>
      </div>
    </div>

    <div class="ob-rate-bar">
      <div class="ob-rate-pill">
        <span>Kurs:</span>
        <span class="ob-rate-value">Memuat...</span>
      </div>
      <span class="ob-rate-source">Checking...</span>
    </div>

    <div class="ob-body">
      <div class="ob-section">
        <div class="ob-section-header">
          <span class="ob-section-badge ob-section-badge--ask">Asks (Sell)</span>
        </div>
        <div class="ob-table-scroll ob-asks-scroll">
          <table class="ob-table ob-asks-table">
            <thead>
              <tr>
                <th class="ob-th-base">Price (${BASE})</th>
                <th>Price (IDR)</th>
                <th>Vol (IDR)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="3" class="ob-table-empty">Memuat asks...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="ob-section">
        <div class="ob-section-header">
          <span class="ob-section-badge ob-section-badge--bid">Bids (Buy)</span>
        </div>
        <div class="ob-table-scroll ob-bids-scroll">
          <table class="ob-table ob-bids-table">
            <thead>
              <tr>
                <th class="ob-th-base">Price (${BASE})</th>
                <th>Price (IDR)</th>
                <th>Vol (IDR)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="3" class="ob-table-empty">Memuat bids...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // DOM Elements
  const header = modal.querySelector('.ob-header');
  const rateValueEl = modal.querySelector('.ob-rate-value');
  const rateSourceEl = modal.querySelector('.ob-rate-source');
  const statusDot = modal.querySelector('.ob-status-dot');
  const btnMinimize = modal.querySelector('.ob-btn-minimize');
  const btnRefresh = modal.querySelector('.ob-btn-refresh');
  const btnClose = modal.querySelector('.ob-btn-close');
  const asksTable = modal.querySelector('.ob-asks-table');
  const bidsTable = modal.querySelector('.ob-bids-table');
  const asksScroll = modal.querySelector('.ob-asks-scroll');
  const thBases = modal.querySelectorAll('.ob-th-base');

  function saveState() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          left: modal.style.left,
          top: modal.style.top,
          isMinimized: modal.classList.contains('ob-modal--minimized'),
        })
      );
    } catch (e) { }
  }

  // Draggable Handler
  let isDragging = false, startX = 0, startY = 0, initL = 0, initT = 0;
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.ob-btn-icon')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = modal.getBoundingClientRect();
    initL = rect.left;
    initT = rect.top;
    header.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const nx = Math.max(10, Math.min(window.innerWidth - 60, initL + (e.clientX - startX)));
    const ny = Math.max(10, Math.min(window.innerHeight - 40, initT + (e.clientY - startY)));
    modal.style.left = `${nx}px`;
    modal.style.top = `${ny}px`;
    modal.style.right = 'auto';
  });

  window.addEventListener('pointerup', () => {
    if (!isDragging) return;
    isDragging = false;
    saveState();
  });

  btnMinimize.addEventListener('click', (e) => {
    e.stopPropagation();
    const min = modal.classList.toggle('ob-modal--minimized');
    btnMinimize.textContent = min ? '▢' : '—';
    btnMinimize.title = min ? 'Perbesar' : 'Perkecil';
    saveState();
  });

  btnRefresh.addEventListener('click', (e) => {
    e.stopPropagation();
    fetchRate(true);
  });

  btnClose.addEventListener('click', (e) => {
    e.stopPropagation();
    modal.remove();
  });

  // Rate Fetching Engine (with Cross-Tab Shared Cache to prevent spamming when 50+ tabs are open)
  function saveRateCache(key, rate, src) {
    try {
      localStorage.setItem(key, JSON.stringify({ rate, src, ts: Date.now() }));
    } catch (e) {}
  }

  function fetchRate(force = false) {
    const target = (BASE || 'USDT').toUpperCase();
    const cacheKey = `ob_shared_rate_${target}`;

    // 1. Cek cross-tab cache di localStorage (TTL 25 detik)
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached && typeof cached.rate === 'number' && Date.now() - cached.ts < 25000) {
          applyRate(cached.rate, `${cached.src}`);
          return;
        }
      } catch (e) {}
    }

    const query = target === 'USDT' || target === 'USD' ? 'USD,USDT' : `${target},USDT,USD`;
    const localUrl = `http://192.168.1.170:5173/rates?bases=${query}`;

    statusDot.className = 'ob-status-dot ob-status-dot--warning';

    requestHttp({
      method: 'GET',
      url: localUrl,
      onload: (res) => {
        try {
          const json = JSON.parse(res.responseText);
          const raw = json.rates?.[target] ?? json.rates?.[BASE] ?? (target === 'USD' ? json.rates?.USDT : undefined) ?? json.rates?.USDT;
          const val = parseFloat(raw);
          if (!isNaN(val) && val > 0) {
            saveRateCache(cacheKey, val, 'Local API');
            applyRate(val, 'Local API');
            return;
          }
          fallbackIndodax(target, cacheKey);
        } catch (e) {
          fallbackIndodax(target, cacheKey);
        }
      },
      onerror: () => fallbackIndodax(target, cacheKey),
    });
  }

  function fallbackIndodax(target, cacheKey) {
    const pair = PAIR_MAP[target] || `${target.toLowerCase()}idr`;
    requestHttp({
      method: 'GET',
      url: `https://indodax.com/api/ticker/${pair}`,
      onload: (res) => {
        try {
          const json = JSON.parse(res.responseText);
          const val = parseFloat(json.ticker?.last);
          if (!isNaN(val) && val > 0) {
            if (cacheKey) saveRateCache(cacheKey, val, 'Indodax');
            applyRate(val, 'Indodax');
            return;
          }
          statusDot.className = 'ob-status-dot ob-status-dot--error';
          rateSourceEl.textContent = 'Offline';
        } catch (e) {
          statusDot.className = 'ob-status-dot ob-status-dot--error';
          rateSourceEl.textContent = 'Offline';
        }
      },
      onerror: () => {
        statusDot.className = 'ob-status-dot ob-status-dot--error';
        rateSourceEl.textContent = 'Offline';
      },
    });
  }

  function applyRate(val, src) {
    RATE_IDR = val;
    rateValueEl.textContent = `1 ${BASE} = Rp ${fmtIDR(val)}`;
    rateSourceEl.textContent = src;
    statusDot.className = 'ob-status-dot';
  }

  fetchRate();
  setInterval(fetchRate, 30000);

  // Table In-Place Reconciliation (Anti-flicker, 60fps)
  function reconcileTable(tbl, items, side) {
    const tbody = tbl.querySelector('tbody');
    if (!items || items.length === 0) {
      if (!tbody.querySelector('.ob-table-empty')) {
        tbody.innerHTML = `<tr><td colspan="3" class="ob-table-empty">Menunggu data ${side}...</td></tr>`;
      }
      return;
    }

    const signature = items.map((it) => `${it.rawPrice || it.price}_${it.amount || 0}_${RATE_IDR}`).join('|');
    if (tbl.__sig === signature) return;
    tbl.__sig = signature;

    if (tbody.querySelector('.ob-table-empty')) tbody.innerHTML = '';

    const rows = Array.from(tbody.children);

    while (rows.length < items.length) {
      const tr = document.createElement('tr');
      tr.className = 'ob-tr';
      tr.innerHTML = `
        <td class="${side === 'ask' ? 'ob-cell-price-ask' : 'ob-cell-price-bid'}"></td>
        <td class="ob-cell-price-idr"></td>
        <td class="ob-cell-vol-idr"></td>
      `;
      tbody.appendChild(tr);
      rows.push(tr);
    }

    while (rows.length > items.length) {
      rows.pop().remove();
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const tr = rows[i];
      const cells = tr.children;

      const pStr = formatTokenPrice(it.rawPrice, it.price, precision);
      const idrPrice = it.price * RATE_IDR;
      const volIDR = (it.amount || 0) * it.price * RATE_IDR;

      const fIdr = fmtIDRPrice(idrPrice);
      const fVol = fmtIDR(volIDR);

      if (cells[0].textContent !== pStr) cells[0].textContent = pStr;
      if (cells[1].textContent !== fIdr) cells[1].textContent = fIdr;
      if (cells[2].textContent !== fVol) cells[2].textContent = fVol;

      tr.onclick = () => {
        tr.classList.remove('ob-clicked');
        void tr.offsetWidth;
        tr.classList.add('ob-clicked');
        adapter.fillPrice(it.price, precision);
      };
    }
  }

  // Update Loop with safety guard
  let isUpdating = false;
  function updateData() {
    if (isUpdating) return;
    isUpdating = true;

    try {
      // Check if pair/currency changed in SPA
      const currentBase = adapter.getBaseCurrency();
      if (currentBase && currentBase !== BASE) {
        BASE = currentBase;
        modal.querySelector('.ob-title-text').textContent = `${BASE} → IDR`;
        thBases.forEach((th) => (th.textContent = `Price (${BASE})`));
        fetchRate();
      }

      if (adapter.detectPrecision) {
        precision = adapter.detectPrecision();
      }

      const asks = adapter.extract('ask') || [];
      const bids = adapter.extract('bid') || [];

      reconcileTable(asksTable, asks, 'ask');
      reconcileTable(bidsTable, bids, 'bid');

      if (asksScroll && !asksScroll.__scrolled && asks.length > 0) {
        asksScroll.scrollTop = asksScroll.scrollHeight;
        asksScroll.__scrolled = true;
      }
    } finally {
      isUpdating = false;
    }
  }

  // High-performance, lightweight polling (300ms) - completely immune to infinite DOM recursion
  setInterval(updateData, 300);

  // Debounce helper for MutationObserver
  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }
  const debouncedUpdate = debounce(updateData, 150);

  // Safe MutationObserver: only observe specific orderbook container, ignore our own modal mutations
  function initSafeObserver() {
    const obContainer =
      document.querySelector('.order-book-component') ||
      document.querySelector('.e-order-book') ||
      document.querySelector('.orderbook-list') ||
      document.querySelector('.orderlist-container') ||
      document.querySelector('[data-qa*="order-book"]') ||
      document.querySelector('[class*="orderbook" i]') ||
      document.querySelector('[class*="orderBook" i]') ||
      document.querySelector('[class*="order-book" i]');

    if (!obContainer) {
      setTimeout(initSafeObserver, 1500);
      return;
    }

    const obs = new MutationObserver((mutations) => {
      // Ignore mutations originating from inside our own modal
      const isSelf = mutations.every((m) => modal.contains(m.target));
      if (isSelf) return;
      debouncedUpdate();
    });

    obs.observe(obContainer, { subtree: true, childList: true, characterData: true });
  }

  initSafeObserver();
})();

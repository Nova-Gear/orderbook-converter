// ==UserScript==
// @name         Bitget Orderbook to IDR Modal (LIGHT & FAST, ASK BOTTOM, Fill Input)
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Bitget orderbook IDR conversion, faster update, ask cheapest at bottom, fill price input
// @match        https://www.bitget.com/spot/*
// @grant        GM_xmlhttpRequest
// @connect      indodax.com
// ==/UserScript==

(function () {
    'use strict';

    let RATE_IDR = 16500;
    let PRICE_PRECISION = 2;
    const MAX_ROWS = 20;
    const ORDER_UPDATE_INTERVAL = 800;
    const RATE_UPDATE_INTERVAL = 30000;

    let BASE = getBaseCurrency();
    let lastOrders = { bids: [], asks: [] };

    function getBaseCurrency() {
        const m = location.pathname.match(/trade\/([A-Z0-9]+)_([A-Z0-9]+)/i);
        return m ? m[2].toUpperCase() : 'USDT';
    }

    const PAIR_MAP = { USDT: 'usdtidr', BTC: 'btcidr', ETH: 'ethidr', BNB: 'bnbidr' };

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

    const fmtIDR = n => isFinite(n) ? n.toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '-';
    const fmtIDRPrice = n => {
        if (!isFinite(n)) return '-';
        if (n < 1) return n.toLocaleString('id-ID', { minimumFractionDigits: 6 });
        if (n < 1000) return n.toLocaleString('id-ID', { minimumFractionDigits: 2 });
        return n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
    };

    // =================== Modal ===================
    const modal = document.createElement('div');
    Object.assign(modal.style, {
        position: 'fixed', right: '20px', top: '120px', width: '420px',
        background: 'rgba(30,30,30,0.95)', color: '#f0f0f0',
        border: '1px solid #555', borderRadius: '8px',
        zIndex: 999999, padding: '10px',
        fontFamily: 'Consolas, monospace', fontSize: '12px',
        resize: 'both', overflow: 'auto',
    });

    const header = document.createElement('div');
    header.textContent = `Bitget Orderbook → IDR (kurs 1 ${BASE})`;
    Object.assign(header.style, { cursor: 'move', fontWeight: 'bold', marginBottom: '6px', color: '#ffcc00', userSelect: 'none' });

    const info = document.createElement('div');
    info.style.fontSize = '11px'; info.style.opacity = '0.8';

    function makeTable() {
        const t = document.createElement('table');
        t.style.width = '100%'; t.style.borderCollapse = 'collapse';
        t.innerHTML = `<thead>
        <tr style="background:#444">
          <th style="text-align:left;padding:4px">price (${BASE})</th>
          <th style="padding:4px">price (IDR)</th>
          <th style="padding:4px">vol (IDR)</th>
        </tr></thead><tbody></tbody>`;
        return t;
    }

    const asksTable = makeTable();
    const bidsTable = makeTable();
    modal.append(header, asksTable, info, bidsTable);
    document.body.appendChild(modal);

    // drag
    (function drag(el, handle){
        let sx=0,sy=0,drag=false;
        handle.addEventListener('pointerdown', e=>{drag=true; sx=e.clientX-el.offsetLeft; sy=e.clientY-el.offsetTop; handle.setPointerCapture(e.pointerId); e.preventDefault();});
        window.addEventListener('pointermove', e=>{if(drag){el.style.left=e.clientX-sx+'px'; el.style.top=e.clientY-sy+'px'; el.style.right='auto';}});
        window.addEventListener('pointerup', ()=>drag=false);
    })(modal, header);

    function detectPrecision() {
        const el=document.querySelector('.last-price-value');
        if(!el) return setTimeout(detectPrecision,1500);
        const txt=el.textContent.trim();
        if(txt.includes('.')) PRICE_PRECISION = txt.split('.')[1].replace(/0+$/,'').length || 1;
    }
    detectPrecision();

    // =================== Kurs ===================
    function updateRate() {
        const ticker = PAIR_MAP[BASE] || 'usdtidr';
        GM_xmlhttpRequest({
            method:'GET', url:`https://indodax.com/api/ticker/${ticker}`,
            onload: res=>{
                try {
                    const j = JSON.parse(res.responseText);
                    const last=parseFloat(j.ticker?.last);
                    if(last){ RATE_IDR=last; info.textContent=`1 ${BASE} = ${fmtIDR(RATE_IDR)} IDR`; }
                } catch(e){ console.log('Error parsing rate', e);}
            }
        });
    }
    updateRate();
    setInterval(updateRate,RATE_UPDATE_INTERVAL);

    // =================== Extract & Render ===================
    function extract(side){
        const rows=document.querySelectorAll('div.flex > ul');
        const data=[];
        rows.forEach(ul=>{
            const priceEl=ul.children[0], volEl=ul.children[1];
            if(!priceEl||!volEl) return;
            const bar=ul.parentElement.querySelector('div.absolute');
            if(!bar) return;
            const isBid=bar.classList.contains('bg-contentTradeBuy');
            const isAsk=bar.classList.contains('bg-contentTradeSell');
            if((side==='bid'&&!isBid)||(side==='ask'&&!isAsk)) return;
            const price=parseNumber(priceEl.textContent);
            const vol=parseNumber(volEl.textContent);
            if(!isFinite(price)||!isFinite(vol)) return;
            data.push({ rawPrice: priceEl.textContent.trim(), price, idrPrice: price*RATE_IDR, volIDR: price*vol*RATE_IDR });
        });
        return data.filter(d => isFinite(d.price));
    }

    function render(tbl,data,color){
        const body=tbl.querySelector('tbody'); body.innerHTML='';
        data.forEach(r=>{
            const tr=document.createElement('tr');
            tr.innerHTML=`<td style="padding:4px;text-align:left;color:${color};cursor:pointer">${r.rawPrice}</td>
                <td style="padding:4px;text-align:right;color:#ffd966">${fmtIDRPrice(r.idrPrice)}</td>
                <td style="padding:4px;text-align:right">${fmtIDR(r.volIDR)}</td>`;
            tr.onclick=()=>fillPrice(r.price);
            body.appendChild(tr);
        });
    }

    // =================== FILL PRICE INPUT ===================
    function fillPrice(price){
        const v = price.toFixed(PRICE_PRECISION);
        const input = document.querySelector('input[aria-label="coin number"]');
        if(input){
            input.value = v;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function updateOrders(){
        let asks=extract('ask').slice(0,MAX_ROWS).sort((a,b)=>b.price-a.price); // cheapest at bottom
        let bids=extract('bid').slice(0,MAX_ROWS).sort((a,b)=>b.price-a.price); // highest on top

        if(JSON.stringify(asks)!==JSON.stringify(lastOrders.asks) || JSON.stringify(bids)!==JSON.stringify(lastOrders.bids)){
            render(asksTable,asks,'#ff6666');
            render(bidsTable,bids,'#66ff66');
            lastOrders={asks,bids};
        }
    }
    setInterval(updateOrders,ORDER_UPDATE_INTERVAL);

    // =================== URL change watcher ===================
    let lastUrl = location.href;
    setInterval(()=>{
        if(location.href!==lastUrl){
            lastUrl=location.href; BASE=getBaseCurrency();
            header.textContent=`Bitget Orderbook → IDR (kurs 1 ${BASE})`;
            info.textContent=`Memuat kurs ${BASE}...`;
            updateRate();
        }
    },1000);

})();

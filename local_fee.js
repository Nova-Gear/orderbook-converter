// ==UserScript==
// @name         Local Withdraw Fee Modal Auto-Detect with IDR
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Fetch local withdraw-fee API and show in IDR
// @match        https://www.binance.com/*/trade/*
// @match        https://www.gate.com/*/trade/*
// @match        https://www.kucoin.com/*/trade/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const modal = document.createElement('div');
    Object.assign(modal.style, {
        position: 'fixed',
        right: '20px',
        top: '120px',
        width: '460px',
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
        resize: 'both',
        overflow: 'auto',
    });

    const header = document.createElement('div');
    header.textContent = 'Local Withdraw Fee API';
    Object.assign(header.style, {
        cursor: 'move',
        fontWeight: 'bold',
        paddingBottom: '6px',
        borderBottom: '1px solid #555',
        marginBottom: '8px',
        color: '#ffcc00',
    });
    modal.appendChild(header);

    const info = document.createElement('div');
    info.textContent = 'Memuat data...';
    Object.assign(info.style, { fontSize: '11px', opacity: '0.8', marginBottom: '6px' });
    modal.appendChild(info);

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.innerHTML = `
        <thead>
            <tr style="background:#444;text-align:right;position:sticky;top:0;z-index:5;">
                <th style="text-align:left;padding:4px;">Network</th>
                <th style="padding:4px;color:#ffd966;">Withdraw Fee (USDT)</th>
                <th style="padding:4px;color:#ffd966;">Withdraw Fee (IDR)</th>
                <th style="padding:4px;">Withdraw Enabled</th>
                <th style="padding:4px;">Deposit Enabled</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    modal.appendChild(table);
    document.body.appendChild(modal);

    const tbody = table.querySelector('tbody');

    // --- draggable ---
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
            el.style.left = (e.clientX - x) + 'px';
            el.style.top = (e.clientY - y) + 'px';
            el.style.right = 'auto';
        });
        window.addEventListener('pointerup', () => (drag = false));
    })(modal, header);

    // --- detect exchange and coin from URL ---
    function detectExchangeAndCoin() {
        const url = window.location.href;
        let exchange = '';
        let coin = '';
        if (url.includes('binance.com')) {
            exchange = 'binance';
            const match = url.match(/\/trade\/([A-Z0-9_]+)/);
            if(match) coin = match[1].split('_')[1] || 'USDT';
        } else if (url.includes('kucoin.com')) {
            exchange = 'kucoin';
            const match = url.match(/\/trade\/([A-Z0-9-]+)/);
            if(match) coin = match[1].split('-')[1] || 'USDT';
        } else if (url.includes('gate.com')) {
            exchange = 'gateio';
            const match = url.match(/\/trade\/([A-Z0-9_]+)/);
            if(match) coin = match[1].split('_')[1] || 'USDT';
        }
        return { exchange, coin };
    }

    // --- fetch kurs IDR dari Indodax ---
    function fetchUSDTtoIDR() {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://indodax.com/api/ticker/usdtidr',
                onload: (res) => {
                    try {
                        const json = JSON.parse(res.responseText);
                        const last = parseFloat(json.ticker?.last);
                        if (!isNaN(last) && last > 1000) resolve(last);
                        else resolve(0);
                    } catch (err) {
                        console.warn('❌ Gagal parse kurs Indodax', err);
                        resolve(0);
                    }
                },
                onerror: () => resolve(0)
            });
        });
    }

    // --- fetch local API via GM_xmlhttpRequest ---
    async function fetchData() {
        const kursIDR = await fetchUSDTtoIDR();
        const { exchange, coin } = detectExchangeAndCoin();
        if(!exchange || !coin) {
            info.textContent = 'Hanya mendukung Binance, KuCoin, Gate.io';
            tbody.innerHTML = `<tr><td colspan="5" style="color:#ff6060;padding:4px;">Tidak ada data</td></tr>`;
            return;
        }

        info.textContent = `Memuat data ${coin} dari ${exchange}...`;
        tbody.innerHTML = `<tr><td colspan="5" style="padding:4px;color:#888;">Loading...</td></tr>`;

        GM_xmlhttpRequest({
            method: "GET",
            url: `http://localhost:8080/api/withdraw-fee/${coin}/${exchange}`,
            headers: { "Accept": "application/json" },
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    info.textContent = `${data.coin || coin} - ${data.name || exchange}`;
                    tbody.innerHTML = '';
                    if (data.networkList && data.networkList.length) {
                        for (const net of data.networkList) {
                            const feeIDR = kursIDR ? Number(parseFloat(net.withdrawFee) * kursIDR).toLocaleString('id-ID', { maximumFractionDigits: 0 }) : 0;
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td style="padding:4px;color:#60c0ff;">${net.network}</td>
                                <td style="padding:4px;color:#ffd966;">${net.withdrawFee}</td>
                                <td style="padding:4px;color:#ffd966;">${feeIDR}</td>
                                <td style="padding:4px;text-align:center;color:${net.withdrawEnabled?'#66ff66':'#ff6060'};">${net.withdrawEnabled}</td>
                                <td style="padding:4px;text-align:center;color:${net.depositEnabled?'#66ff66':'#ff6060'};">${net.depositEnabled}</td>
                            `;
                            tbody.appendChild(tr);
                        }
                    } else {
                        tbody.innerHTML = `<tr><td colspan="5" style="padding:4px;color:#ff6060;">No network data</td></tr>`;
                    }
                } catch (err) {
                    info.textContent = 'Gagal memproses data';
                    tbody.innerHTML = `<tr><td colspan="5" style="color:#ff6060;padding:4px;">${err}</td></tr>`;
                }
            },
            onerror: function(err) {
                info.textContent = 'Gagal fetch data';
                tbody.innerHTML = `<tr><td colspan="5" style="color:#ff6060;padding:4px;">${err}</td></tr>`;
            }
        });
    }

    fetchData();
    setInterval(fetchData, 30000);

})();

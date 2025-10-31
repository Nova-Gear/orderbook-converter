// ==UserScript==
// @name         Indodax Fee Fetcher (Auto Update + Reattach)
// @namespace    https://indodax.com/
// @version      2.1
// @description  Ambil nilai fee penarikan kurs IDR dari Indodax dan update otomatis saat ganti coin atau elemen hilang
// @match        https://indodax.com/trade/*
// @grant        GM_xmlhttpRequest
// @connect      indodax.com
// ==/UserScript==

(function() {
    'use strict';

    /** Ambil pair dari URL */
    function extractCoinPair() {
        const urlParts = window.location.pathname.split('/');
        return urlParts[2] || '';
    }

    /** Ambil fee penarikan */
    function getWithdrawFee(coinPair) {
        return new Promise(resolve => {
            let coin = coinPair.toUpperCase().replace('IDR', '');
            const financeURL = `https://indodax.com/finance/${coin}`;
            GM_xmlhttpRequest({
                method: "GET",
                url: financeURL,
                onload: function(response) {
                    if (response.status === 200) {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, "text/html");
                        const feeEl = doc.querySelector("#withdraw_fee_value");
                        // console.log(feeEl);
                        if (feeEl) {
                            const feeText = feeEl.textContent.trim().replace(',', '.');
                            // console.log(feeText);
                            resolve(parseFloat(feeText));
                        } else {
                            console.log("Tidak Menemukan Element Fee");
                            resolve(0);
                        };
                    } else {
                        console.log("Gagal Fetch");
                        resolve(0);
                    };
                },
                onerror: () => resolve(0)
            });
        });
    }

    /** Ambil harga terakhir */
    function getTicker(coinPair) {
        return new Promise(resolve => {
            const tickerAPI = `https://indodax.com/api/ticker/${coinPair.toLowerCase()}`;
            GM_xmlhttpRequest({
                method: "GET",
                url: tickerAPI,
                onload: function(response) {
                    if (response.status === 200) {
                        try {
                            const data = JSON.parse(response.responseText);
                            resolve(parseFloat(data.ticker.last));
                        } catch { resolve(0); }
                    } else resolve(0);
                },
                onerror: () => resolve(0)
            });
        });
    }

    /** Tampilkan fee di UI */
    function ensureFeeDisplay() {
        let feeDisplay = document.querySelector("#feeDisplayInfo");
        const tabContainer = document.querySelector(".relative.flex-1.inline-flex.border-b");

        // Jika belum ada container target, tunda
        if (!tabContainer) return null;

        // Pastikan container bisa menampung elemen
        tabContainer.style.display = "flex";

        // Jika belum ada elemen feeDisplay atau terlepas dari DOM, buat baru
        if (!feeDisplay || !tabContainer.contains(feeDisplay)) {
            feeDisplay = document.createElement("span");
            feeDisplay.id = "feeDisplayInfo";
            feeDisplay.style.cssText = `
                margin-left: auto;
                font-size: 12px;
                color: rgb(237 251 29);
                font-weight: bold;
                align-self: center;
            `;
            tabContainer.appendChild(feeDisplay);
        }

        return feeDisplay;
    }

    /** Update isi fee di elemen */
    function displayFee(coin, fee, rate) {
        const feeInIDR = (fee * rate).toFixed(0);
        const formattedFeeInIDR = feeInIDR.toLocaleString('en-US', { maximumFractionDigits: 0 });
        const feeDisplay = ensureFeeDisplay();
        if (!feeDisplay) return;
        feeDisplay.textContent = `Fee: ${fee} ${coin} (~IDR ${formattedFeeInIDR})`;
    }

    /** Jalankan fetch dan tampilkan */
    async function updateFeeInfo() {
        const coinPair = extractCoinPair();
        if (!coinPair) return;
        const coin = coinPair.toUpperCase().replace('IDR', '');
        console.log(`[FeeFetcher] Update untuk ${coinPair}`);

        const [fee, rate] = await Promise.all([
            getWithdrawFee(coinPair),
            getTicker(coinPair)
        ]);

        displayFee(coin, fee, rate);
    }

    // Jalankan saat halaman pertama load
    window.addEventListener('load', updateFeeInfo);

    // Deteksi perubahan URL (ganti coin)
    let lastURL = location.href;
    setInterval(() => {
        if (location.href !== lastURL) {
            lastURL = location.href;
            if (location.pathname.startsWith("/trade/")) {
                updateFeeInfo();
            }
        }
    }, 1000);

    // Monitor jika elemen hilang dari DOM → re-append otomatis
    setInterval(() => {
        const feeDisplay = document.querySelector("#feeDisplayInfo");
        const tabContainer = document.querySelector(".relative.flex-1.inline-flex.border-b");
        if (tabContainer && (!feeDisplay || !tabContainer.contains(feeDisplay))) {
            console.log("[FeeFetcher] Elemen fee hilang, re-attach...");
            updateFeeInfo();
        }
    }, 2000);

})();

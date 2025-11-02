import crypto from "crypto";
import dotenv from "dotenv";
import redis from "redis";
dotenv.config();

class RedisClient {
  constructor() {
    this.client = redis.createClient({
      url: process.env.REDIS_URL
    });
    this.client.on("connect", () => {
      console.log("Connected to Redis");
    });
    this.client.on("error", (err) => {
      console.error("Redis error:", err);
    });
  }

  async connect() {
    await this.client.connect();
  }

  async set(key, value) {
    await this.client.set(key, value);
  }

  async get(key) {
    return await this.client.get(key);
  }

  async quit() {
    await this.client.quit();
  }
}

/* ---------------------- BINANCE ---------------------- */
class BinanceCoinConfig {
  constructor() {
    this.apiKey = process.env.BINANCE_API_KEY;
    this.secretKey = process.env.BINANCE_API_SECRET;
    this.redisClient = new RedisClient();
  }

  async main() {
    await this.redisClient.connect();
    const serverRes = await fetch("https://api.binance.com/api/v3/time");
    const serverTime = (await serverRes.json()).serverTime; // in milliseconds
    const timestamp = serverTime;

    const query = new URLSearchParams({ timestamp }).toString();

    const signature = crypto
      .createHmac("sha256", this.secretKey)
      .update(query)
      .digest("hex");

    const url = `https://api.binance.com/sapi/v1/capital/config/getall?${query}&signature=${signature}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { "X-MBX-APIKEY": this.apiKey }
    });

    const data = await res.json();
    console.log(data);
    await this.redisClient.set("binance_raw_coin_config", JSON.stringify(data));

    const coinData = data.map((item) => ({
      coin: item.coin,
      name: item.name,
      networkList: item.networkList.map((network) => ({
        network: network.network,
        withdrawFee: network.withdrawFee,
        withdrawEnabled: network.withdrawEnable,
        depositEnabled: network.depositEnable,
      })),
    }));

    await this.redisClient.set("binance_withdraw_config", JSON.stringify(coinData));
    await this.redisClient.quit();
    console.log("✅ Binance data stored successfully.");
  }
}

/* ---------------------- KUCOIN ---------------------- */
class KucoinCoinConfig {
  constructor() {
    this.apiKey = process.env.KUCOIN_API_KEY;
    this.secretKey = process.env.KUCOIN_API_SECRET;
    this.passphrase = process.env.KUCOIN_API_PASSPHRASE;
    this.redisClient = new RedisClient();
  }

  async main() {
    await this.redisClient.connect();
    const endpoint = "/api/v3/currencies";

    const res = await fetch(`https://api.kucoin.com${endpoint}`, {
      method: "GET",
    });
    const data = await res.json();
    // console.log(data);
    
    const coinData = data.data.map((item) => ({
      coin: item.currency,
      name: item.name,
      networkList: Array.isArray(item.chains)
        ? item.chains.map((network) => ({
            network: network.chainName,
            withdrawFee: network.withdrawalMinFee,
            withdrawEnabled: network.isWithdrawEnabled,
            depositEnabled: network.isDepositEnabled,
          }))
        : [], // fallback to empty array if chains is null or not an array
    }));


    await this.redisClient.set("kucoin_withdraw_config", JSON.stringify(coinData));
    await this.redisClient.quit();
    console.log("✅ KuCoin data stored successfully.");
  }
}

/* ---------------------- GATE.IO ---------------------- */
class GateioCoinConfig {
  constructor() {
    this.apiKey = process.env.GATEIO_API_KEY;
    this.secretKey = process.env.GATEIO_API_SECRET;
    this.redisClient = new RedisClient();
  }

  genSign(method, url, queryString = null, payloadString = null) {
    const key = this.apiKey;
    const secret = this.secretKey;

    const t = Date.now() / 1000;
    const m = crypto.createHash("sha512");
    m.update(Buffer.from(payloadString || "", "utf-8"));

    const hashedPayload = m.digest("hex");
    const s = `${method}\n${url}\n${queryString || ""}\n${hashedPayload}\n${t}`;
    const sign = crypto
      .createHmac("sha512", secret)
      .update(s)
      .digest("hex");
    return { KEY: key, Timestamp: t, SIGN: sign };
  }

  async main() {
    await this.redisClient.connect();
    var url = "https://api.gateio.ws/api/v4/spot/currencies";
    var res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    var data = await res.json();
    var coinData = data.map((item) => ({
      coin: item.currency,
      name: item.name,
      networkList: item.chains.map((network) => ({
        network: network.name,
        withdrawFee: 0,
        withdrawEnabled: !network.withdraw_disabled,
        depositEnabled: !network.deposit_disabled,
      })),
    }));

    var url = "https://api.gateio.ws";
    var prefix = "/api/v4";
    var endpoint = "/wallet/withdraw_status";

    var sign_headers = this.genSign("GET", prefix + endpoint, null, null);
    var res = await fetch(url + endpoint, {
      method: "GET",
      headers: { "Accept": "application/json", ...sign_headers }
    });
    var data = await res.json();
    console.log(data);

    coinData.forEach((item) => {
      item.networkList.forEach((network) => {
        data.forEach((coin) => {
          if (coin.currency === item.coin) {
            network.withdrawFee = Number(coin.withdraw_fix_on_chains[network.network]) || 0;
          }
        });
      });
    });

    await this.redisClient.set("gateio_withdraw_config", JSON.stringify(coinData));
    await this.redisClient.quit();
    console.log("✅ Gate.io data stored successfully.");
  }
}

class Debug {
  constructor() {
    this.redisClient = new RedisClient();
  }

  async main() {
    await this.redisClient.connect();
    const data = await this.redisClient.get("binance_raw_coin_config");
    for (const item of JSON.parse(data)) {
      if (item.coin === "USDT") {
        console.log(item);
      }
    }
    await this.redisClient.quit();
  }
}

/* ---------------------- RUN ALL ---------------------- */
async function runAll() {
  try {
    await new BinanceCoinConfig().main();
    // await new KucoinCoinConfig().main();
    // await new GateioCoinConfig().main();
    // await new Debug().main();
  } catch (e) {
    console.error("❌ Error:", e);
  }
}

runAll();

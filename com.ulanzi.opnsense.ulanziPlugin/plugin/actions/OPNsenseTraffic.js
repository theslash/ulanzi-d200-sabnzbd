import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';
import { URL } from 'url';
import { Utils } from './ulanzi-api/index.js';

const DEFAULTS = {
  host: 'https://opnsense.home.arpa',
  api_key: '',
  api_secret: '',
  interface: 'wan',
  poll_seconds: '60',
  insecure_tls: true,
  click_action: 'open_ui',
};

const COLORS = {
  idle: { bg: '#15202B', fg: '#D7E2F0', accent: '#5B9BD5' },
  active: { bg: '#0F2438', fg: '#FFFFFF', accent: '#3DDC84' },
  error: { bg: '#3A1212', fg: '#FFB4B4', accent: '#FF5A5A' },
  connecting: { bg: '#1B2433', fg: '#A8B3C7', accent: '#6B7C93' },
};

function loadLocalConfig() {
  try {
    const pluginPath = Utils.getPluginPath();
    const configPath = path.join(pluginPath, 'local-config.json');
    if (!fs.existsSync(configPath)) return {};
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(text, max = 14) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function normalizeHost(host) {
  let value = String(host || '').trim();
  if (!value) value = DEFAULTS.host;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value.replace(/\/+$/, '');
}

function asBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === 'on' || value === '1' || value === 1;
}

function parseBytes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Format bytes/sec as MB/s (decimal megabytes). */
function formatMBps(bytesPerSec) {
  const rate = Number(bytesPerSec);
  if (!Number.isFinite(rate) || rate < 0) return '0.00';
  const mb = rate / 1_000_000;
  if (mb >= 100) return mb.toFixed(0);
  if (mb >= 10) return mb.toFixed(1);
  return mb.toFixed(2);
}

function pickTheme(downBps, upBps, error) {
  if (error) return COLORS.error;
  if ((downBps || 0) + (upBps || 0) > 50_000) return COLORS.active;
  return COLORS.idle;
}

export default class OPNsenseTraffic {
  constructor(context, $UD) {
    this.context = context;
    this.$UD = $UD;
    this.settings = { ...DEFAULTS };
    this.allowSend = true;
    this.pollTimer = null;
    this.lastTraffic = null;
    this.lastError = null;
    this.fetching = false;
    this.prevCounters = null;
    this.renderConnecting();
  }

  updateSettings(settings, type) {
    const incoming = { ...(settings || {}) };
    const previous = { ...(this.settings || {}) };
    for (const bag of [incoming, previous]) {
      if (!String(bag.api_key || '').trim()) delete bag.api_key;
      if (!String(bag.api_secret || '').trim()) delete bag.api_secret;
      if (!String(bag.host || '').trim()) delete bag.host;
      if (!String(bag.interface || '').trim()) delete bag.interface;
    }

    const local = loadLocalConfig();
    this.settings = {
      ...DEFAULTS,
      ...local,
      ...previous,
      ...incoming,
    };
    this.settings.host = normalizeHost(this.settings.host);
    this.settings.api_key = String(this.settings.api_key || local.api_key || '').trim();
    this.settings.api_secret = String(this.settings.api_secret || local.api_secret || '').trim();
    this.settings.interface = String(this.settings.interface || local.interface || DEFAULTS.interface).trim() || 'wan';
    this.settings.poll_seconds = String(
      Math.max(5, Number(this.settings.poll_seconds) || Number(DEFAULTS.poll_seconds))
    );
    this.settings.insecure_tls = asBool(
      this.settings.insecure_tls ?? local.insecure_tls,
      DEFAULTS.insecure_tls
    );

    this.startPolling(type === 'init');
  }

  setActive(active) {
    this.allowSend = !!active;
    if (this.allowSend) this.refresh();
  }

  async run() {
    try {
      this.$UD.openUrl(this.settings.host + '/');
    } catch (err) {
      this.lastError = err.message || String(err);
      this.renderError(this.lastError);
      this.$UD.toast('OPNsense open failed');
    }
  }

  destroy() {
    this.stopPolling();
  }

  startPolling(immediate = true) {
    this.stopPolling();
    const seconds = Math.max(5, Number(this.settings.poll_seconds) || 60);
    if (immediate) this.refresh();
    this.pollTimer = setInterval(() => this.refresh(), seconds * 1000);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async refresh() {
    if (this.fetching) return;
    this.fetching = true;
    try {
      const traffic = await this.fetchTraffic();
      this.lastTraffic = traffic;
      this.lastError = null;
      this.renderTraffic(traffic);
    } catch (err) {
      this.lastError = err.message || String(err);
      this.renderError(this.lastError);
    } finally {
      this.fetching = false;
    }
  }

  basicAuthHeader() {
    const token = Buffer.from(
      `${this.settings.api_key}:${this.settings.api_secret}`,
      'utf8'
    ).toString('base64');
    return `Basic ${token}`;
  }

  requestJson(pathname) {
    const host = normalizeHost(this.settings.host);
    const url = new URL(pathname, `${host}/`);
    const lib = url.protocol === 'http:' ? http : https;
    const rejectUnauthorized = !this.settings.insecure_tls;

    return new Promise((resolve, reject) => {
      const req = lib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (url.protocol === 'http:' ? 80 : 443),
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers: {
            Authorization: this.basicAuthHeader(),
            Accept: 'application/json',
          },
          rejectUnauthorized,
          timeout: 12000,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8').trim();
            if (res.statusCode === 401 || res.statusCode === 403) {
              reject(
                new Error(
                  res.statusCode === 401
                    ? 'API auth failed'
                    : 'API forbidden (privileges)'
                )
              );
              return;
            }
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }
            try {
              resolve(text ? JSON.parse(text) : {});
            } catch {
              reject(new Error(truncate(text || `HTTP ${res.statusCode}`, 40)));
            }
          });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      req.on('error', (err) => reject(err));
      req.end();
    });
  }

  async apiGet(pathname) {
    if (!this.settings.api_key || !this.settings.api_secret) {
      throw new Error('API key missing');
    }
    return this.requestJson(pathname);
  }

  findInterfaceEntry(bag, wanted) {
    if (!bag || typeof bag !== 'object') return null;
    const target = String(wanted || 'wan').toLowerCase();
    const entries = Object.entries(bag);

    for (const [key, value] of entries) {
      if (String(key).toLowerCase() === target) return { key, value };
    }
    for (const [key, value] of entries) {
      const name = String(value?.name || value?.descr || value?.description || '').toLowerCase();
      const device = String(value?.device || value?.if || '').toLowerCase();
      if (name === target || device === target) return { key, value };
    }
    // Prefer an entry that looks like WAN if exact match missing
    for (const [key, value] of entries) {
      const blob = `${key} ${value?.name || ''} ${value?.descr || ''}`.toLowerCase();
      if (/\bwan\b/.test(blob)) return { key, value };
    }
    return null;
  }

  extractCounters(data) {
    const interfaces =
      data?.interfaces ||
      data?.statistics ||
      data?.Interface ||
      data?.interface ||
      data?.data ||
      data;
    const found = this.findInterfaceEntry(interfaces, this.settings.interface);
    if (!found) throw new Error(`Interface ${this.settings.interface} not found`);

    const v = found.value || {};
    const rx =
      parseBytes(v['bytes received']) ??
      parseBytes(v.bytes_received) ??
      parseBytes(v['bytes received total']) ??
      parseBytes(v.inbytes) ??
      parseBytes(v.ibytes) ??
      parseBytes(v.rx_bytes) ??
      parseBytes(v.received);
    const tx =
      parseBytes(v['bytes transmitted']) ??
      parseBytes(v.bytes_transmitted) ??
      parseBytes(v['bytes transmitted total']) ??
      parseBytes(v.outbytes) ??
      parseBytes(v.obytes) ??
      parseBytes(v.tx_bytes) ??
      parseBytes(v.transmitted);

    // Some OPNsense builds expose instantaneous rates instead of counters.
    const downRate =
      parseBytes(v['bytes received rate']) ??
      parseBytes(v.bytes_received_rate) ??
      parseBytes(v.in_rate) ??
      parseBytes(v.rate_in) ??
      parseBytes(v['rate in']);
    const upRate =
      parseBytes(v['bytes transmitted rate']) ??
      parseBytes(v.bytes_transmitted_rate) ??
      parseBytes(v.out_rate) ??
      parseBytes(v.rate_out) ??
      parseBytes(v['rate out']);

    return {
      key: found.key,
      name: v.name || found.key,
      rx,
      tx,
      downRate,
      upRate,
    };
  }

  ratesFromCounters(sample, nowMs) {
    if (sample.downRate != null || sample.upRate != null) {
      return {
        interfaceKey: sample.name || sample.key,
        downBps: sample.downRate || 0,
        upBps: sample.upRate || 0,
        source: 'rate',
      };
    }

    if (sample.rx == null || sample.tx == null) {
      throw new Error('No byte counters in API');
    }

    const current = { key: sample.key, rx: sample.rx, tx: sample.tx, at: nowMs };
    const prev = this.prevCounters;
    this.prevCounters = current;

    if (!prev || prev.key !== current.key || !(nowMs > prev.at)) {
      return {
        interfaceKey: sample.name || sample.key,
        downBps: 0,
        upBps: 0,
        source: 'stats-warmup',
      };
    }

    const dt = (nowMs - prev.at) / 1000;
    return {
      interfaceKey: sample.name || sample.key,
      downBps: Math.max(0, (sample.rx - prev.rx) / dt),
      upBps: Math.max(0, (sample.tx - prev.tx) / dt),
      source: 'delta',
    };
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async fetchTraffic() {
    // OPNsense /api/diagnostics/traffic/interface returns cumulative counters.
    // We derive MB/s from the delta between polls.
    let data;
    try {
      data = await this.apiGet('/api/diagnostics/traffic/interface');
    } catch (err) {
      if (/API auth failed|API key missing|API forbidden/i.test(err.message || '')) throw err;
      data = await this.apiGet('/api/diagnostics/interface/getInterfaceStatistics');
    }

    let sample = this.extractCounters(data);
    let rates = this.ratesFromCounters(sample, Date.now());

    // First sample has no delta yet → take a short second sample so the key
    // shows real numbers immediately instead of waiting a full poll interval.
    if (rates.source === 'stats-warmup') {
      await this.sleep(2000);
      try {
        data = await this.apiGet('/api/diagnostics/traffic/interface');
      } catch {
        data = await this.apiGet('/api/diagnostics/interface/getInterfaceStatistics');
      }
      sample = this.extractCounters(data);
      rates = this.ratesFromCounters(sample, Date.now());
    }

    return rates;
  }

  renderConnecting() {
    this.setIcon(
      this.buildIcon({
        theme: COLORS.connecting,
        lines: ['OPN', '…', 'connect'],
      })
    );
  }

  renderError(message) {
    const msg = String(message || '');
    const missingKey = /api key missing/i.test(msg);
    const badAuth = /api auth failed|unauthorized/i.test(msg);
    const forbidden = /forbidden|privileges/i.test(msg);
    const offline = /fetch failed|ECONNREFUSED|Timeout|network|ENOTFOUND|EHOSTUNREACH|certificate/i.test(
      msg
    );

    let lines;
    if (missingKey) {
      lines = ['NO KEY', 'Set key+secret', 'in config'];
    } else if (badAuth) {
      lines = ['BAD KEY', 'Check API', 'credentials'];
    } else if (forbidden) {
      lines = ['NO ACL', 'Grant API', 'privileges'];
    } else if (offline) {
      lines = ['OFFLINE', 'Check host', 'TLS/config'];
    } else {
      lines = ['ERROR', truncate(msg, 12), ''];
    }

    this.setIcon(
      this.buildIcon({
        theme: missingKey || badAuth || forbidden || offline ? COLORS.connecting : COLORS.error,
        lines,
      })
    );
  }

  renderTraffic(traffic) {
    if (traffic.source === 'stats-warmup') {
      this.setIcon(
        this.buildIcon({
          theme: COLORS.connecting,
          lines: ['WAN', 'measuring…', ''],
        })
      );
      return;
    }

    const down = formatMBps(traffic.downBps);
    const up = formatMBps(traffic.upBps);
    const theme = pickTheme(traffic.downBps, traffic.upBps);
    const iface = String(traffic.interfaceKey || this.settings.interface || 'wan').toUpperCase();

    this.setIcon(
      this.buildIcon({
        theme,
        lines: [iface, `↓ ${down} MB/s`, `↑ ${up} MB/s`],
      })
    );
  }

  buildIcon({ theme, lines }) {
    const [l1, l2, l3] = lines.map((line) => escapeXml(line));
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="${theme.bg}"/>
  <rect x="0" y="0" width="144" height="6" fill="${theme.accent}"/>
  <text x="72" y="42" text-anchor="middle" fill="${theme.accent}" font-size="14" font-weight="700" font-family="Helvetica,Arial,sans-serif" letter-spacing="1">OPN</text>
  <text x="72" y="72" text-anchor="middle" fill="${theme.fg}" font-size="22" font-weight="700" font-family="Helvetica,Arial,sans-serif">${l1}</text>
  <text x="72" y="100" text-anchor="middle" fill="${theme.fg}" font-size="20" font-weight="700" font-family="Helvetica,Arial,sans-serif">${l2}</text>
  <text x="72" y="126" text-anchor="middle" fill="${theme.accent}" font-size="20" font-weight="700" font-family="Helvetica,Arial,sans-serif">${l3}</text>
</svg>`;

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  setIcon(dataUrl) {
    if (!this.allowSend || !dataUrl) return;
    this.$UD.setBaseDataIcon(this.context, dataUrl);
  }
}

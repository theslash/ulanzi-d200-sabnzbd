import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const DEFAULTS = {
  host: 'http://127.0.0.1:8080',
  apikey: '',
  poll_seconds: '3',
  click_action: 'start_or_open',
  app_path: '/Applications/SABnzbd.app',
  show_job_name: true,
};

const COLORS = {
  idle: { bg: '#1B2433', fg: '#8BE58F', accent: '#52C45A' },
  downloading: { bg: '#102A1A', fg: '#FFFFFF', accent: '#3DDC84' },
  paused: { bg: '#3A2A12', fg: '#FFD27A', accent: '#F0A202' },
  error: { bg: '#3A1212', fg: '#FFB4B4', accent: '#FF5A5A' },
  connecting: { bg: '#1B2433', fg: '#A8B3C7', accent: '#6B7C93' },
};

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
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  return value.replace(/\/+$/, '');
}

function formatSpeed(queue) {
  const speed = String(queue.speed || '').trim();
  if (speed && speed !== '0') {
    return /[a-zA-Z]/.test(speed) ? speed : `${speed} KB/s`;
  }
  const kb = Number(queue.kbpersec || 0);
  if (!kb) return '0 KB/s';
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB/s`;
  return `${kb.toFixed(0)} KB/s`;
}

function pickTheme(status, paused, error) {
  if (error) return COLORS.error;
  if (paused || /pause/i.test(status || '')) return COLORS.paused;
  if (/download|fetch|grab|propagat/i.test(status || '')) return COLORS.downloading;
  if (/idle|complete/i.test(status || '')) return COLORS.idle;
  return COLORS.connecting;
}

export default class SABnzbdStatus {
  constructor(context, $UD) {
    this.context = context;
    this.$UD = $UD;
    this.settings = { ...DEFAULTS };
    this.allowSend = true;
    this.pollTimer = null;
    this.lastQueue = null;
    this.lastError = null;
    this.fetching = false;
    this.renderConnecting();
  }

  updateSettings(settings, type) {
    this.settings = {
      ...DEFAULTS,
      ...this.settings,
      ...settings,
    };
    this.settings.host = normalizeHost(this.settings.host);
    this.settings.apikey = String(this.settings.apikey || '').trim();
    this.settings.poll_seconds = String(
      Math.max(1, Number(this.settings.poll_seconds) || Number(DEFAULTS.poll_seconds))
    );
    this.settings.show_job_name =
      this.settings.show_job_name === true ||
      this.settings.show_job_name === 'true' ||
      this.settings.show_job_name === 'on' ||
      this.settings.show_job_name === '1';

    this.startPolling(type === 'init');
  }

  setActive(active) {
    this.allowSend = !!active;
    if (this.allowSend) this.refresh();
  }

  async run() {
    const action = this.settings.click_action || 'start_or_open';

    try {
      if (action === 'toggle_pause') {
        await this.togglePause();
        return;
      }

      if (action === 'open_ui') {
        this.$UD.openUrl(this.settings.host + '/');
        return;
      }

      // Default: start_or_open
      const online = await this.isOnline();
      if (online) {
        this.$UD.openUrl(this.settings.host + '/');
        return;
      }

      await this.startSABnzbd();
      this.$UD.toast('SABnzbd wird gestartet…');
      this.renderConnecting();
      const ready = await this.waitUntilOnline(45000);
      if (ready) {
        this.$UD.toast('SABnzbd gestartet');
        await this.refresh();
      } else {
        this.renderError('Start timeout');
        this.$UD.toast('SABnzbd startet noch…');
      }
    } catch (err) {
      this.lastError = err.message || String(err);
      this.renderError(this.lastError);
      this.$UD.toast('SABnzbd action failed');
    }
  }

  async togglePause() {
    const paused = this.lastQueue?.paused || /pause/i.test(this.lastQueue?.status || '');
    await this.apiCall(paused ? 'resume' : 'pause');
    this.$UD.toast(paused ? 'SABnzbd resumed' : 'SABnzbd paused');
    await this.refresh();
  }

  async isOnline() {
    try {
      await this.apiCall('version');
      return true;
    } catch {
      try {
        const host = normalizeHost(this.settings.host);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        const resp = await fetch(host + '/', { signal: controller.signal });
        clearTimeout(timeout);
        return resp.ok || resp.status < 500;
      } catch {
        return false;
      }
    }
  }

  async waitUntilOnline(maxMs = 45000) {
    const started = Date.now();
    while (Date.now() - started < maxMs) {
      if (await this.isOnline()) return true;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  }

  async startSABnzbd() {
    const appPath = String(this.settings.app_path || DEFAULTS.app_path).trim() || DEFAULTS.app_path;
    try {
      await execFileAsync('open', ['-a', appPath]);
    } catch {
      // Fallback: open by app name
      await execFileAsync('open', ['-a', 'SABnzbd']);
    }
  }

  destroy() {
    this.stopPolling();
  }

  startPolling(immediate = true) {
    this.stopPolling();
    const seconds = Math.max(1, Number(this.settings.poll_seconds) || 3);
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
      const data = await this.apiCall('queue', { limit: 1 });
      this.lastQueue = data.queue || data;
      this.lastError = null;
      this.renderQueue(this.lastQueue);
    } catch (err) {
      this.lastError = err.message || String(err);
      this.renderError(this.lastError);
    } finally {
      this.fetching = false;
    }
  }

  async apiCall(mode, extra = {}) {
    const host = normalizeHost(this.settings.host);
    const apikey = this.settings.apikey;
    if (!apikey) throw new Error('API key missing');

    const params = new URLSearchParams({
      mode,
      output: 'json',
      apikey,
      ...Object.fromEntries(
        Object.entries(extra).map(([k, v]) => [k, String(v)])
      ),
    });

    const url = `${host}/api?${params.toString()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data?.error) throw new Error(data.error);
      if (data?.status === false && data?.error) throw new Error(data.error);
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Timeout');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  renderConnecting() {
    this.setIcon(
      this.buildIcon({
        theme: COLORS.connecting,
        lines: ['SAB', '…', 'connect'],
        progress: 0,
      })
    );
  }

  renderError(message) {
    const offline =
      /fetch failed|ECONNREFUSED|Timeout|network|Failed to fetch|aborted/i.test(message || '') ||
      !this.lastQueue;

    this.setIcon(
      this.buildIcon({
        theme: offline ? COLORS.connecting : COLORS.error,
        lines: offline
          ? ['OFFLINE', 'Press to start', '']
          : ['ERROR', truncate(message, 12), ''],
        progress: 0,
      })
    );
  }

  renderQueue(queue) {
    const status = queue.status || (queue.paused ? 'Paused' : 'Idle');
    const paused = !!queue.paused;
    const theme = pickTheme(status, paused);
    const slots = Number(queue.noofslots_total ?? queue.noofslots ?? 0);
    const job = queue.slots?.[0];
    const percentage = Number(job?.percentage ?? 0);
    const speed = formatSpeed(queue);
    const timeleft = queue.timeleft && queue.timeleft !== '0:00:00' ? queue.timeleft : '';

    let line1 = status.toUpperCase();
    let line2 = slots ? `${slots} in Q` : 'Queue empty';
    let line3 = speed;

    if (paused) {
      line1 = 'PAUSED';
      line2 = slots ? `${slots} waiting` : 'No jobs';
      line3 = timeleft || '—';
    } else if (/download|fetch|grab/i.test(status) && job) {
      line1 = speed;
      line2 = `${Math.round(percentage)}%`;
      if (this.settings.show_job_name) {
        line3 = truncate(job.filename || job.name || 'Download', 13);
      } else {
        line3 = timeleft || `${slots} left`;
      }
    } else if (/idle/i.test(status)) {
      line1 = 'IDLE';
      line2 = 'Queue empty';
      line3 = '';
    }

    this.setIcon(
      this.buildIcon({
        theme,
        lines: [line1, line2, line3],
        progress: /download|fetch|grab/i.test(status) ? percentage / 100 : paused ? 0 : 0,
        badge: slots > 0 ? String(Math.min(slots, 99)) : '',
      })
    );
  }

  buildIcon({ theme, lines, progress = 0, badge = '' }) {
    const [l1, l2, l3] = lines.map((line) => escapeXml(line));
    const pct = Math.max(0, Math.min(1, progress));
    const barWidth = Math.round(112 * pct);
    const badgeSvg = badge
      ? `<circle cx="120" cy="24" r="13" fill="${theme.accent}"/><text x="120" y="28" text-anchor="middle" fill="#101820" font-size="13" font-weight="700" font-family="Helvetica,Arial,sans-serif">${escapeXml(badge)}</text>`
      : '';

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="${theme.bg}"/>
  <rect x="0" y="0" width="144" height="6" fill="${theme.accent}"/>
  <text x="72" y="46" text-anchor="middle" fill="${theme.accent}" font-size="15" font-weight="700" font-family="Helvetica,Arial,sans-serif" letter-spacing="1">SAB</text>
  <text x="72" y="78" text-anchor="middle" fill="${theme.fg}" font-size="28" font-weight="700" font-family="Helvetica,Arial,sans-serif">${l1}</text>
  <text x="72" y="104" text-anchor="middle" fill="${theme.fg}" font-size="16" font-weight="600" font-family="Helvetica,Arial,sans-serif">${l2}</text>
  <text x="72" y="124" text-anchor="middle" fill="${theme.accent}" font-size="14" font-weight="600" font-family="Helvetica,Arial,sans-serif">${l3}</text>
  <rect x="16" y="134" width="112" height="6" rx="3" fill="#00000055"/>
  <rect x="16" y="134" width="${barWidth}" height="6" rx="3" fill="${theme.accent}"/>
  ${badgeSvg}
</svg>`;

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  setIcon(dataUrl) {
    if (!this.allowSend || !dataUrl) return;
    this.$UD.setBaseDataIcon(this.context, dataUrl);
  }
}

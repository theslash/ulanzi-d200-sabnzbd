# Ulanzi D200 – SABnzbd Status Plugin

Shows live SABnzbd download status on an [Ulanzi D200](https://www.ulanzi.com/) key and can start SABnzbd or open its web UI.

## Features

- Live queue status (speed, progress, job name, pause state)
- Color-coded key display (idle / downloading / paused / offline)
- **Press when offline:** starts `/Applications/SABnzbd.app`
- **Press when online:** opens the SABnzbd web UI
- Optional actions: pause/resume only, or always open UI
- Configurable host, API key, poll interval

## Requirements

- macOS or Windows with [Ulanzi Studio](https://www.ulanzi.com/pages/ulanzi-app)
- SABnzbd with API access enabled
- Node.js 20+ (only to build from source)

## Install (macOS)

```bash
./install.sh
```

Then restart **Ulanzi Studio**, drag **Download Status** onto a key, and enter:

- Host URL, e.g. `http://127.0.0.1:8080`
- API key from SABnzbd → Config → General → Security

Manual install path:

`~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/com.ulanzi.sabnzbd.ulanziPlugin`

## Build from source

```bash
cd com.ulanzi.sabnzbd.ulanziPlugin
npm install
npm run build
```

## License

MIT

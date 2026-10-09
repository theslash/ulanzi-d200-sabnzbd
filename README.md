# Ulanzi D200 Plugins

Plugins für das [Ulanzi D200](https://www.ulanzi.com/) Stream Deck.

## Plugins

| Plugin | Ordner | Aktion |
|--------|--------|--------|
| SABnzbd Download-Status | `com.ulanzi.sabnzbd.ulanziPlugin` | Download Status |
| OPNsense WAN Traffic | `com.ulanzi.opnsense.ulanziPlugin` | WAN Traffic |

## Installation (macOS)

```bash
./install.sh            # SABnzbd
./install-opnsense.sh   # OPNsense
```

Danach **Ulanzi Studio neu starten** und die Action auf eine Taste ziehen.

Installationspfad:

`~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/`

## Secrets / Config

Jedes Plugin liest optionale Credentials aus `local-config.json` im Plugin-Ordner.

- Vorlage: `local-config.example.json`
- Echte Datei: `local-config.json` (**nicht committen**, steht in `.gitignore`)

### SABnzbd

```json
{
  "host": "http://127.0.0.1:8080",
  "apikey": "example_sabnzbd_api_key_replace_me"
}
```

### OPNsense

```json
{
  "host": "https://opnsense.home.arpa",
  "api_key": "example_opnsense_api_key_replace_me",
  "api_secret": "example_opnsense_api_secret_replace_me",
  "interface": "wan",
  "poll_seconds": "60",
  "insecure_tls": true
}
```

Der OPNsense-API-User braucht Rechte für Diagnostics Traffic / Interface Statistics.

## Build from source

```bash
cd com.ulanzi.sabnzbd.ulanziPlugin   # oder com.ulanzi.opnsense.ulanziPlugin
npm install
npm run build
```

Node.js 20+ erforderlich.

## License

MIT

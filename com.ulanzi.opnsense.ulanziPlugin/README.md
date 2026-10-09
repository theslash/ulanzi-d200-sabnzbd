# OPNsense für Ulanzi D200

Zeigt Live Up-/Downstream (MB/s) der OPNsense-Firewall auf einer Taste des Ulanzi D200.

## Anzeige

- Interface-Name (z.B. WAN)
- Downstream `↓ x.xx` in MB/s
- Upstream `↑ x.xx` in MB/s
- Tastendruck öffnet die OPNsense-Weboberfläche

## Konfiguration

Secrets und Verbindungsdaten gehören in `local-config.json` (ist in `.gitignore`):

```bash
cp local-config.example.json local-config.json
```

Beispiel:

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

### OPNsense API-Rechte

Unter **System → Access → Users** (oder Groups) braucht der API-User mindestens:

- Diagnostics: Traffic Graph / Interface Traffic
- Diagnostics: Interface Statistics

Ohne diese Rechte zeigt die Taste `NO ACL`.

API-Key + Secret: **System → Access → Users → [User] → API keys**.

## Installation

```bash
# aus dem Repo-Root
./install-opnsense.sh
```

Oder manuell:

```bash
cd com.ulanzi.opnsense.ulanziPlugin
npm install
npm run build
```

Plugin-Pfad:

`~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/com.ulanzi.opnsense.ulanziPlugin`

Danach **Ulanzi Studio neu starten** und Action **WAN Traffic** auf eine Taste ziehen.

## Defaults

- Host: `https://opnsense.home.arpa`
- Interface: `wan`
- Poll: alle 60 Sekunden
- Self-signed TLS: erlaubt
- Anzeige: nur MB/s

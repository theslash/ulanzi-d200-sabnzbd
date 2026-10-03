# SABnzbd für Ulanzi D200

Zeigt den Live-Downloadstatus von SABnzbd auf einer Taste des Ulanzi D200.

## Anzeige

- Status / Geschwindigkeit
- Fortschritt in %
- Queue-Größe oder Jobname
- Farben: Idle (grün), Downloading (hellgrün), Paused (orange), Error (rot)

## Installation

1. Plugin bauen (einmalig):

```bash
cd com.ulanzi.sabnzbd.ulanziPlugin
npm install
npm run build
```

2. Ordner `com.ulanzi.sabnzbd.ulanziPlugin` nach hier kopieren:

`~/Library/Application Support/Ulanzi/UlanziDeck/Plugins/`

3. **Ulanzi Studio neu starten**
4. Action **Download Status** auf eine Taste ziehen
5. Host + API-Key prüfen (Defaults sind bereits gesetzt)

## Defaults

- Host: `http://127.0.0.1:8080`
- Poll: alle 3 Sekunden
- Tastendruck: Pause / Fortsetzen

## Tastendruck

In den Action-Einstellungen wählbar:

- **Pause / Resume** – Queue pausieren oder fortsetzen
- **Open SABnzbd UI** – Weboberfläche im Browser öffnen

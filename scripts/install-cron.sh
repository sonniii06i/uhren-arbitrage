#!/usr/bin/env bash
# Installiert einen launchd-Job der alle 30 Minuten die komplette Pipeline läuft:
# scrape-sold → scrape:ebay → scrape:chronext → scrape:uhren2000 → scrape:marks
# → compute-deals → post-deals (nur neue Deals → Discord)
#
# Benutzung: bash scripts/install-cron.sh

set -euo pipefail

PROJECT_DIR="/Users/sonnibuttke/uhren-arbitrage"
LABEL="de.uhren-arbitrage.pipeline"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>cd ${PROJECT_DIR} && /usr/local/bin/npm run pipeline >> ${LOG_DIR}/pipeline.log 2>&1</string>
  </array>
  <key>StartInterval</key>
  <integer>1800</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
</dict>
</plist>
EOF

# Bestehenden Job ggf. abmelden und neu laden
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load -w "$PLIST_PATH"

echo "✓ Cron installiert: alle 30 Min Pipeline-Run"
echo "  Plist: $PLIST_PATH"
echo "  Logs: $LOG_DIR/pipeline.log"
echo ""
echo "Status prüfen:    launchctl list | grep uhren-arbitrage"
echo "Sofort ausführen: launchctl start $LABEL"
echo "Deaktivieren:     launchctl unload $PLIST_PATH"

#!/bin/bash
# Run on the host lab machine at the start of each session.
# Starts the HTTP server and SyncServer, and writes config.local.js.

cd "$(dirname "$0")"

# Detect LAN IP (tries en0 then en1, common macOS interface names)
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

if [ -z "$LAN_IP" ]; then
    echo "Could not detect LAN IP — check network connection."
    echo "SyncServer will print the correct IP when it starts."
    echo "Update config.local.js manually with that IP before opening browsers."
    LAN_IP="<LAN-IP>"
fi

# Write config.local.js
cat > config.local.js <<EOF
window.LOCAL_CONFIG = {
    syncServerUrl: 'ws://$LAN_IP:8766'
};
EOF

echo ""
echo "=== Lab session ready ==="
echo ""
echo "  Experiment:   http://$LAN_IP:8080"
echo "  Sync server:  ws://$LAN_IP:8766"
echo ""
echo "Open in both browsers:  http://$LAN_IP:8080"
echo ""
echo "Press Ctrl+C to stop."
echo ""

python3 -m http.server 8080 &
HTTP_PID=$!

.venv/bin/python data/SyncServer.py &
SYNC_PID=$!

trap "echo ''; echo 'Stopping...'; kill $HTTP_PID $SYNC_PID 2>/dev/null; exit" INT TERM
wait

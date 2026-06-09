#!/bin/bash
# Run this on the host lab machine at the start of each session.
# It detects your LAN IP, writes config.local.js, and starts all servers.
# Both browsers then open: http://[LAN-IP]:8080

cd "$(dirname "$0")"

# Detect LAN IP (connects briefly to an external IP to find the right interface)
LAN_IP=$(python3 -c "
import socket
s = socket.socket()
s.connect(('8.8.8.8', 80))
print(s.getsockname()[0])
s.close()
" 2>/dev/null)

if [ -z "$LAN_IP" ]; then
    echo "ERROR: Could not detect LAN IP. Make sure you are connected to the lab network."
    exit 1
fi

# Write config.local.js with the detected IP
cat > config.local.js <<EOF
window.LOCAL_CONFIG = {
    syncServerUrl: 'ws://$LAN_IP:8766'
};
EOF

echo ""
echo "=== Lab session ready ==="
echo ""
echo "  LAN IP:        $LAN_IP"
echo "  Experiment:    http://$LAN_IP:8080"
echo "  Sync server:   ws://$LAN_IP:8766"
echo "  Pupil bridge:  ws://localhost:8765  (run SendData.py separately if using Pupil Core)"
echo ""
echo "Open in both browsers:  http://$LAN_IP:8080"
echo ""
echo "Press Ctrl+C to stop all servers."
echo ""

# Start HTTP server and SyncServer
python3 -m http.server 8080 &
HTTP_PID=$!

.venv/bin/python data/SyncServer.py &
SYNC_PID=$!

trap "echo ''; echo 'Stopping servers...'; kill $HTTP_PID $SYNC_PID 2>/dev/null; exit" INT TERM
wait

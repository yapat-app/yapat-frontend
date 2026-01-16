#!/bin/sh
set -e

# Generate runtime config.js file
cat > /usr/share/nginx/html/config.js <<EOF
window.__ENV__ = {
  VITE_YAPAT_BACKEND_URL: "${VITE_YAPAT_BACKEND_URL:-http://localhost:8000}"
};
EOF

# Start nginx
exec nginx -g "daemon off;"

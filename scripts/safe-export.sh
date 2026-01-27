#!/bin/bash
# Safe export script - excludes sensitive files
# Usage: ./scripts/safe-export.sh

# Version from docs/INDEX.md (package.json may not be updated due to Replit restrictions)
VERSION="3.2.0"
FILENAME="LearnSnap_v${VERSION}_$(date +%Y%m%d).zip"

echo "Creating production export: $FILENAME"

zip -r "$FILENAME" . \
  -x "*.env*" \
  -x "logs/*" \
  -x "node_modules/*" \
  -x "dist/*" \
  -x ".git/*" \
  -x "*.log" \
  -x "_archive/*" \
  -x "*.zip" \
  -x ".replit" \
  -x "replit.nix" \
  -x ".local/*" \
  -x ".cache/*" \
  -x ".config/*" \
  -x ".upm/*" \
  -x ".npm/*" \
  -x "attached_assets/*" \
  -x "coverage/*"

echo "Created: $FILENAME"
echo ""
echo "Verifying no secrets included..."
if unzip -l "$FILENAME" | grep -qE "\.env|\.secret|\.log$"; then
  echo "WARNING: Sensitive files may be included!"
  unzip -l "$FILENAME" | grep -E "\.env|\.secret|\.log$"
else
  echo "OK: No sensitive files detected"
fi

ls -lh "$FILENAME"

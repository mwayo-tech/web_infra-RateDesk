#!/usr/bin/env bash
# Deploys Ratedesk to web-01 and web-02 under /ratedesk/.
# Usage: ./deploy/deploy.sh PATH_TO_SSH_KEY WEB01_IP WEB02_IP [SSH_USER]
# The app goes in /var/www/html/ratedesk so the earlier index and 404 page stay untouched.
set -euo pipefail

Key="${1:?usage: deploy.sh PATH_TO_SSH_KEYNWEB01-IP WEB02_IP [SSH_USER]}"
WEB01="${2:?misssing web-01 IP}"
WEB02="${3:?missing web-02 IP}"
USER_NAME="${4:-ubuntu}"
ROOT="$(cd "$(dirname "$0")/.."&& pwd)"
SSH_OPTS=(-i "$KEY" -O StrictHostkeyChecking=accept-new)

for HOST in "WEB01" "WEB02"; do
echo "==> Deploying to $HOST"
ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" 'RM -RF ~/ratedesk_upload && mkdir -p ~/ratedesk_upload'
scp "${SSH_OPTS[@]}" -r"$ROOT/index.html" "$ROOT/css" "$ROOT/js" "$ROOT/img" "$USER_NAME@$HOST:~/ratedesk_upload/"
ssh "${SSH_OPTS[@]}" "$USER_NAME@$HOST" \
    'sudo rm -rf /var/www/html/ratedesk && sudo mkdir -p /var/www/html/ratedesk && sudo cp -r ~/ratedesk_upload/* /var/www/html/ratedesk/ && sudo chown -R root:root /var/www/html/ratedesk && rm -rf ~/ratedesk_upload'
echo "  http://$HOST/ratedesk/ -> $(curl -s -o /dev/null -w '%{http_code}' "http://$HOST/ratedesk/")"
done
echo "Done. Test through the load balancer: https://www.mwayo.tech/ratedesk/"

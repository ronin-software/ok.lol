#!/bin/sh
# Start sish (HTTP on 8080, SSH on 2222) and Caddy (HTTP gate on 80).

sish \
  --ssh-address=0.0.0.0:2222 \
  --http-address=0.0.0.0:8080 \
  --domain=w.ok.lol \
  --private-keys-directory=/deploy/keys \
  --authentication-keys-directory=/deploy/pubkeys \
  --bind-random-subdomains=false \
  --force-requested-subdomains \
  --authentication=false \
  --idle-connection-timeout=5m \
  --verify-dns=false \
  --load-templates=false &

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile

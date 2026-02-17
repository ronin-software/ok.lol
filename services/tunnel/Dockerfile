FROM antoniomika/sish:latest AS sish
FROM caddy:2-alpine

# Grab the sish binary from the sish image.
COPY --from=sish /app/app /usr/local/bin/sish

# sish needs SSH host keys (deploy/keys/) and an auth keys dir (deploy/pubkeys/).
RUN mkdir -p /deploy/keys /deploy/pubkeys && \
    apk add --no-cache openssh-keygen && \
    ssh-keygen -t ed25519 -f /deploy/keys/ssh_host_ed25519_key -N ""

COPY Caddyfile /etc/caddy/Caddyfile
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Caddy (HTTP gate) on 80, sish SSH on 2222.
EXPOSE 80 2222

CMD ["/start.sh"]

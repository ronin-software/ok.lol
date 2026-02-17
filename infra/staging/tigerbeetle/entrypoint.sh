#!/bin/sh
# Format the data file on first run, then start.
# --development reduces memory footprint for staging.
if [ ! -f /data/0_0.tigerbeetle ]; then
  /tigerbeetle format --cluster=0 --replica=0 --replica-count=1 --development /data/0_0.tigerbeetle
fi
exec /tigerbeetle start --addresses=0.0.0.0:3000 --development /data/0_0.tigerbeetle

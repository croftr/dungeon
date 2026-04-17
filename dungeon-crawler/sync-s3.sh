#!/usr/bin/env bash
# Syncs public/ to s3://robs-dungeon-assets
# Deletes files from S3 that no longer exist locally.

BUCKET="s3://robs-dungeon-assets"
LOCAL_DIR="$(dirname "$0")/public/"
REGION="us-east-1"

echo "Syncing $LOCAL_DIR → $BUCKET"

aws s3 sync "$LOCAL_DIR" "$BUCKET" \
  --region "$REGION" \
  --delete \
  --exclude ".DS_Store" \
  --exclude "Thumbs.db"

echo "Sync complete."

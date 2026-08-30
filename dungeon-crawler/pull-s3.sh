#!/usr/bin/env bash
# Pulls assets from s3://robs-dungeon-assets down to the local public/ folder

BUCKET="s3://robs-dungeon-assets"
LOCAL_DIR="$(dirname "$0")/public/"
REGION="us-east-1"

echo "Pulling $BUCKET → $LOCAL_DIR"

# Note: We omit --delete here by default so we don't accidentally remove 
# newly created local assets before they are pushed up.
aws s3 sync "$BUCKET" "$LOCAL_DIR" \
  --region "$REGION"

echo "Pull complete."

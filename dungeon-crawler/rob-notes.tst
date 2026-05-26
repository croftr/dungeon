//sync to s3 in git bash.  cd projects/dungeon/dungeon-crawler - may need to invalidate cloudfront cache
bash sync-s3.sh

// convert png to webp
ffmpeg -i "img.png" -vf "scale=128:128" "img.webp"

//powershell only convert all png to webp in current directory
Get-ChildItem -File | ForEach-Object { ffmpeg -i $_.Name -vf "scale=128:128" "$($_.BaseName).webp" }

//list sub dirs and sort by size
find . -type f -exec du -h {} + | sort -h
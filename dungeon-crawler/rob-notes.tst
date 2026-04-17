//sync to s3 in git bash.  cd projects/dungeon/dungeon-crawler - may need to invalidate cloudfront cache
bash sync-s3.sh

// convert png to webp
ffmpeg -i "pngaaa.com-235683.png" -vf "scale=128:128" "bronze_key.webp"

//powershell only convert all png to webp in current directory
Get-ChildItem -File | ForEach-Object { ffmpeg -i $_.Name -vf "scale=128:128" "$($_.BaseName).webp" }




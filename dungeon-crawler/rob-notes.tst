//sync to s3
// git bash  projects/dungeon/dungeon-crawler
bash sync-s3.sh

ffmpeg -i "pngaaa.com-235683.png" -vf "scale=128:128" "bronze_key.webp"

//powershell only
Get-ChildItem -File | ForEach-Object { ffmpeg -i $_.Name -vf "scale=128:128" "$($_.BaseName).webp" }




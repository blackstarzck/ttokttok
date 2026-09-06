param(
  [string]$In = "input.mp4",
  [string]$Out = "output.mp4"
)
# 도서 소개 쇼츠 — 자막 번인. 생성: book-shorts-storyboard 스킬
# 사용: H3에서 받은 mp4를 이 폴더에 input.mp4로 두고 실행. 결과는 output.mp4
Set-Location $PSScriptRoot

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Error "ffmpeg가 없습니다. 설치: winget install Gyan.FFmpeg"
  exit 1
}
if (-not (Test-Path $In)) {
  Write-Error "$In 이(가) 없습니다. H3에서 받은 mp4를 이 이름으로 두세요 (또는 -In 경로)."
  exit 1
}

# 폰트를 못 찾으면 -vf 를 "ass=subtitles.ass:fontsdir=C\:/Windows/Fonts" 로 바꾼다
ffmpeg -y -i $In -vf "ass=subtitles.ass" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a copy $Out
if ($LASTEXITCODE -ne 0) { Write-Error "ffmpeg 실패 (exit $LASTEXITCODE)"; exit $LASTEXITCODE }
Write-Host "완료: $Out"

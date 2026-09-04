/**
 * ffmpeg 번인 스크립트 (PowerShell 5.1). BOM은 파일 쓰기에서 붙인다.
 * Set-Location으로 상대 경로를 쓰는 이유: libass 필터 인자에 드라이브 콜론(C:)이
 * 들어가면 이스케이프가 필요해 깨지기 쉽다.
 */
export function renderBurnPs1() {
  return `param(
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

# 폰트를 못 찾으면 -vf 를 "ass=subtitles.ass:fontsdir=C\\:/Windows/Fonts" 로 바꾼다
ffmpeg -y -i $In -vf "ass=subtitles.ass" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a copy $Out
if ($LASTEXITCODE -ne 0) { Write-Error "ffmpeg 실패 (exit $LASTEXITCODE)"; exit $LASTEXITCODE }
Write-Host "완료: $Out"
`;
}

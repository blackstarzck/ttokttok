$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$videoDialog = New-Object System.Windows.Forms.OpenFileDialog
$videoDialog.Title = '웹 재생용으로 변환할 원본 영상 선택'
$videoDialog.Filter = '영상|*.mp4;*.mov;*.mkv;*.webm;*.m4v|모든 파일|*.*'
if ($videoDialog.ShowDialog() -eq 'OK') {
  & node (Join-Path $PSScriptRoot 'convert-video.mjs') $videoDialog.FileName
  if ($LASTEXITCODE -ne 0) { Write-Host '변환에 실패했습니다. 위 오류를 확인하세요.' }
  Read-Host 'Enter 키를 누르면 닫힙니다'
}

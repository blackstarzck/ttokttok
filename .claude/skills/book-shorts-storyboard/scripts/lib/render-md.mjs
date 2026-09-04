import { toH3Timecode, toAssTimecode } from './timecode.mjs';
import { cameraPhrase } from './camera.mjs';
import { wrapCue } from './text.mjs';
import { cuesForShot } from './render-h3.mjs';

/** 사람용 기획서. storyboard.json에서 전부 파생한다 — 손으로 고치지 말고 JSON을 고친다. */
export function renderStoryboardMd(sb, report, evidence) {
  const sel = sb.concepts.find((c) => c.id === sb.selected_concept);
  const others = sb.concepts.filter((c) => c.id !== sb.selected_concept);
  const ev = (id) => evidence[id];
  const out = [];

  out.push(`# ${sb.book.title} — ${sb.duration_sec}초 쇼츠 스토리보드`);
  out.push('');
  out.push(`${sb.book.author ?? ''} · 생성: book-shorts-storyboard 스킬 · 원본: \`storyboard.json\` (이 문서는 파생물 — JSON을 고치고 다시 빌드한다)`);
  out.push('');
  out.push(`## 컨셉 ${sel.id} · ${sel.hook_type} × ${sel.tone} × ${sel.visual_style}`);
  out.push('');
  out.push(`**훅:** ${sel.hook_line_ko}`);
  out.push('');
  out.push(`**왜 이 책인가:** ${sel.why_this_book_ko}`);
  out.push('');
  out.push('| 근거 | 등급 | 주장 | 출처 |');
  out.push('|---|---|---|---|');
  for (const id of sel.evidence) {
    const e = ev(id);
    out.push(e ? `| ${id} | ${e.grade} | ${e.claim_ko} | [${e.source}](${e.url}) |` : `| ${id} | ? | (evidence.json에 없음) | |`);
  }
  out.push('');
  out.push('### 기각안');
  out.push('');
  for (const c of others) out.push(`- **${c.id}** ${c.hook_type} × ${c.tone} × ${c.visual_style} — "${c.hook_line_ko}" (주근거 ${c.primary_evidence})`);
  out.push('');

  out.push('## 타임라인');
  out.push('');
  out.push(`스타일 락: ${sb.style_lock}${sb.character_sheet ? ` · 캐릭터: ${sb.character_sheet}` : ''}`);
  out.push('');
  out.push('| 샷 | 구간 | 화면 | 카메라 | SFX | 내레이션 |');
  out.push('|---|---|---|---|---|---|');
  for (const s of sb.shots) {
    const na = cuesForShot(sb, s).map((c) => c.text_ko).join(' / ');
    out.push(`| ${s.n} | ${toH3Timecode(s.start)}–${toH3Timecode(s.end)} | ${s.description} | ${cameraPhrase(s.camera)} | ${s.sfx ?? ''} | ${na} |`);
  }
  out.push('');
  out.push(`앰비언스: ${sb.overall_soundscape}`);
  out.push('');
  out.push(`BGM: ${sb.non_diegetic_music}`);
  out.push('');

  out.push('## 자막 큐');
  out.push('');
  out.push(`총 ${report.metrics.syllables}음절 (상한 75) · 큐 ${report.metrics.cues}개 · 제목 카드 ${sb.title_card.at}s "${sb.title_card.text_ko}"`);
  out.push('');
  out.push('| 시작 | 끝 | 자막 (줄바꿈 = /) |');
  out.push('|---|---|---|');
  for (const c of [...sb.narration].sort((a, b) => a.start - b.start)) {
    const text = c.no_subtitle
      ? `${c.text_ko} _(음성만 — 제목 카드가 표시)_`
      : wrapCue(c.text_ko).join(' / ');
    out.push(`| ${toAssTimecode(c.start)} | ${toAssTimecode(c.end)} | ${text} |`);
  }
  out.push('');

  out.push('## 콘티');
  out.push('');
  out.push('시트: `contisheet.html` / `contisheet.png` · 패널: `panels/` · 프롬프트: `panel-prompts.txt`');
  out.push('');
  out.push('| # | 샷 | 샷 타입 | VIDEO | AUDIO |');
  out.push('|---|---|---|---|---|');
  for (const p of sb.panels) out.push(`| ${p.id} | ${p.shot} | ${p.shot_type} | ${p.video_note_ko} | ${p.audio_note_ko} |`);
  out.push('');

  out.push('## 제작 절차');
  out.push('');
  out.push('1. `h3-prompt.txt` 내용을 MiniMax H3(Hailuo)에 붙여넣기 — 9:16, 15초, 1440p. 레퍼런스가 필요하면 `panels/`의 PNG를 최대 9장 첨부');
  out.push('2. 결과 mp4를 이 폴더에 `input.mp4`로 저장');
  out.push('3. PowerShell에서 `.\\burn.ps1` 실행 → `output.mp4` (자막 번인)');
  out.push('4. 똑똑 관리자 → 게시물 → 영상 게시물 → `output.mp4` 업로드, 도서 연결, 발행');
  out.push('');
  out.push('## 검증');
  out.push('');
  out.push(report.ok ? '통과.' : `실패: ${report.errors.map((e) => `${e.rule} ${e.message}`).join('; ')}`);
  if (report.warnings.length) out.push(`경고: ${report.warnings.map((w) => `${w.rule} ${w.message}`).join('; ')}`);
  out.push('');
  return out.join('\n');
}

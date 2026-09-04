import { toH3Timecode } from './timecode.mjs';
import { cameraPhrase } from './camera.mjs';

/**
 * MiniMax H3 프롬프트 조립. 문법 정본: references/h3-prompt-spec.md
 * - 3필드: integrated_multimodal_description / overall_soundscape / non_diegetic_music
 * - [Shot N], 두 번째 샷부터 "At MM:SS.mmm, the camera cuts to …"
 * - 보이스오버는 (S1) + <d>[Korean] …</d>, 입은 닫은 채
 * - 똑똑 피드가 좌우 6%를 자르므로 중앙 88% 구도를 지시
 * - 자막은 후처리 번인이므로 화면 텍스트 생성을 금지
 */
const FRAME_RULE = 'Keep every key subject and face inside the central 88% of the frame width — the outer 6% on each side is cropped by the player.';
const NO_TEXT_RULE = 'Do not render any on-screen text, captions, subtitles, titles, or lettering anywhere in the video.';
const NARRATOR_RULE = '(S1) is the narrator and never appears on screen.';
const VOICEOVER = "(S1) says in an off-screen voiceover while every on-screen character's lips remain completely closed:";

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lower = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const period = (s) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export function cuesForShot(sb, shot) {
  return (sb.narration ?? []).filter((c) => c.start >= shot.start && c.start < shot.end);
}

export function renderH3Prompt(sb) {
  const out = [];
  out.push('integrated_multimodal_description:');
  out.push(`${period(sb.style_lock)} Vertical 9:16 portrait video, ${sb.duration_sec} seconds, ${sb.shots.length} shots. ${FRAME_RULE} ${NO_TEXT_RULE}`);
  out.push(sb.character_sheet?.trim()
    ? `Recurring on-screen character: ${period(sb.character_sheet)} Preserve these features in every shot. ${NARRATOR_RULE}`
    : NARRATOR_RULE);
  out.push('');

  sb.shots.forEach((shot, i) => {
    const head = i === 0
      ? `[Shot ${shot.n}] ${period(cap(shot.description))}`
      : `[Shot ${shot.n}] At ${toH3Timecode(shot.start)}, the camera cuts to ${period(lower(shot.description))}`;
    const parts = [head, period(cameraPhrase(shot.camera))];
    if (shot.sfx?.trim()) parts.push(period(cap(shot.sfx)));
    const cues = cuesForShot(sb, shot);
    if (cues.length) parts.push(`${VOICEOVER} <d>[Korean] ${cues.map((c) => c.text_ko.trim()).join(' ')}</d>`);
    out.push(parts.join(' '));
  });

  out.push('');
  out.push('overall_soundscape:');
  out.push(sb.overall_soundscape.trim());
  out.push('');
  out.push('non_diegetic_music:');
  out.push(sb.non_diegetic_music.trim());
  return out.join('\n');
}

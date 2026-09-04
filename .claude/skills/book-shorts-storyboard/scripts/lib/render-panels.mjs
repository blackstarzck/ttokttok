/**
 * 콘티 패널 프롬프트 조립. 기법 근거: references/conti-panel-spec.md
 * - 샷 타입 선두 → 동작 1개 → 캐릭터 시트(반복) → 스타일 락(반복) → 세로 → 텍스트 금지
 * - "모든 프롬프트에 똑같이 반복"은 사람이 하면 틀어지므로 여기서 조립한다
 */
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const period = (s) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export function panelFileName(id) {
  return `panels/panel-${id}.png`;
}

export function renderPanelPrompt(sb, panel) {
  const character = sb.character_sheet?.trim() ? `Character: ${period(sb.character_sheet)} ` : '';
  return `${cap(panel.shot_type)} of ${period(panel.action)} ${character}${period(sb.style_lock)} Vertical 9:16 portrait composition, single storyboard panel. No text, no lettering, no captions, no watermark, no panel border.`;
}

export function renderPanelPrompts(sb) {
  return (sb.panels ?? []).map((p) => ({ id: p.id, file: panelFileName(p.id), prompt: renderPanelPrompt(sb, p) }));
}

export function renderPanelPromptsText(sb) {
  return renderPanelPrompts(sb).map((j) => `## ${j.file}\n${j.prompt}\n`).join('\n');
}

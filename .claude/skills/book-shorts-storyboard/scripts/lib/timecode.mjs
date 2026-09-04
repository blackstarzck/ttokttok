const pad2 = (n) => String(n).padStart(2, '0');

/** MiniMax H3 타임코드: `At 00:03.500, the camera cuts to …` */
export function toH3Timecode(sec) {
  const ms = Math.round(sec * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mmm = String(ms % 1000).padStart(3, '0');
  return `${pad2(m)}:${pad2(s)}.${mmm}`;
}

/** ASS 타임코드: `0:00:03.50` (센티초) */
export function toAssTimecode(sec) {
  const cs = Math.round(sec * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${pad2(m)}:${pad2(s)}.${pad2(c)}`;
}

/**
 * H3 카메라 문법: type + amplitude + speed를 자연어로, 샷당 1개.
 * 정본: references/h3-prompt-spec.md
 */
export const CAMERA_TYPES = {
  static: 'holds completely static',
  push: 'pushes in',
  pull: 'pulls back',
  zoom_in: 'zooms in',
  zoom_out: 'zooms out',
  pan_left: 'pans left',
  pan_right: 'pans right',
  truck_left: 'trucks left',
  truck_right: 'trucks right',
  tilt_up: 'tilts up',
  tilt_down: 'tilts down',
  pedestal_up: 'pedestals up',
  pedestal_down: 'pedestals down',
  arc: 'arcs around the subject',
  tracking: 'tracks alongside the subject',
  shake: 'shakes handheld',
  pov: 'moves as a first-person point of view',
  roll: 'rolls',
};

export const AMPLITUDES = ['small', 'medium', 'large'];
export const SPEEDS = ['slow', 'medium', 'fast'];

export function cameraPhrase(cam) {
  const verb = CAMERA_TYPES[cam.type];
  if (!verb) throw new Error(`알 수 없는 camera.type: ${cam.type}`);
  if (cam.type === 'static') return `The camera ${verb}`;
  let s = `The camera ${verb} with ${cam.amplitude} amplitude at ${cam.speed} speed`;
  if (cam.target) s += ` toward ${cam.target}`;
  return s;
}

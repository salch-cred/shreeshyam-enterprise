/* The 6205 again on inner pages: same model, a short scroll path per page. */
const canvas = document.getElementById('stage');
const page = document.body.dataset.stage;
const hold = o => ({ at: 0, x: 0, y: 0, s: 1, rx: .08, ry: 0, rz: 0, ex: 0, a: 1, fl: 1, ...o });
// On phones the bearing sits in a reserved band under the header, sized from the
// screen width (--stage-band in site.css), so it can never land on the text.
const band = (H, extra = {}) => {
  const d = innerWidth * .56, centre = 76 + d / 2 + 6;
  return { y: 1 - 2 * centre / H, s: d / (H / 2), fl: 0, ...extra };
};
const PATHS = {
  shop: ({ H, W }) => {
    const phone = W < 620, base = phone ? band(H) : { y: .16, s: Math.min(1.12, W * .42 / (H / 2)) };
    return [
      hold({ ...base, x: phone ? 0 : .3, ry: -.5, rx: .1, rz: .06 }),
      hold({ ...base, at: H * .6, x: 1.5, ry: -.3, rx: .05 }),
      hold({ ...base, at: H * .6 + 1, x: 1.5, a: 0 }),
    ];
  },
  account: ({ H, W }) => [hold(W < 620 ? band(H, { ry: .46 }) : { x: -.42, y: -.02, s: Math.min(1.42, W * .4 / (H / 2)), ry: .46 })],
  gate: ({ H, W }) => [hold(W < 620 ? band(H, { ry: .5, y: 1 - 2 * (24 + innerWidth * .28) / H }) : { x: -.38, y: -.02, s: Math.min(1.3, W * .4 / (H / 2)), ry: .5 })],
  lost: ({ H, W }) => [hold(W < 620 ? band(H, { ry: -.2 }) : { x: .52, y: -.08, s: Math.min(.9, W * .3 / (H / 2)), ry: -.2 })],
};
if (canvas && PATHS[page] && document.createElement('canvas').getContext('webgl2')) {
  import('./bearing.js').then(({ start }) => start({ canvas, onStops: PATHS[page] })).catch(() => canvas.remove());
} else if (canvas) canvas.remove();

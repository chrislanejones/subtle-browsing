// Review alternatives only; this does not change the extension's active icons.
// Run `node scripts/generate-icon-options.js` with ImageMagick 7 installed.
import { execFileSync } from 'node:child_process';

const root = 'docs/store/branding';
for (const name of ['browser', 'filter', 'shield']) {
  const master = name === 'browser' ? `${root}/icon-master.png` : `${root}/${name}/master.png`;
  for (const [size, artwork] of [[16, 14], [32, 28], [48, 42], [128, 96], [256, 192]]) {
    const output = `${root}/${name}/icon${size}.png`;
    // A circle needs a little more diameter for comparable visual weight.
    const fit = name === 'filter' && size >= 128 ? Math.round(size * 0.875) : artwork;
    execFileSync('magick', [master, '-fuzz', '5%', '-trim', '+repage',
      '-filter', 'Lanczos', '-resize', `${fit}x${fit}`, '-background', 'none',
      '-gravity', 'center', '-extent', `${size}x${size}`, '-strip', `PNG32:${output}`]);
    console.log(output);
  }
}

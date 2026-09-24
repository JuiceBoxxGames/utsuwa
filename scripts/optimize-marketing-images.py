"""Generate marketing image variants and their manifest. Requires Python 3 and Pillow."""

import json
from pathlib import Path

from PIL import Image, ImageSequence

root = Path(__file__).resolve().parents[1]
static = root / 'static'
sources = [
    *static.joinpath('blog').glob('*'),
    *static.joinpath('marketing').glob('*.webp'),
]
manifest = {}

for source in sorted(sources):
    if source.suffix not in ('.webp', '.png', '.jpg', '.gif'):
        continue
    with Image.open(source) as original:
        url = '/' + source.relative_to(static).as_posix()
        group = source.parent.name
        destination = static / 'optimized' / group
        destination.mkdir(parents=True, exist_ok=True)
        widths = {
            'marketing': [768, 1440],
            'blog': [96, 480, 960, 1920],
        }[group]
        variants = []
        for width in sorted({min(width, original.width) for width in widths}):
            resized = original.convert('RGBA' if 'A' in original.getbands() else 'RGB')
            resized.thumbnail(
                (width, round(width * original.height / original.width)),
                Image.Resampling.LANCZOS,
            )
            target = destination / f'{source.stem}-{resized.width}.webp'
            resized.save(target, 'WEBP', quality=85, method=6)
            variants.append((resized.width, '/' + target.relative_to(static).as_posix()))

        entry = {
            'src': variants[-1][1],
            'srcset': ', '.join(f'{path} {width}w' for width, path in variants),
            'width': original.width,
            'height': original.height,
        }
        # The existing WebP originals retain detail on large, dense displays.
        if group == 'marketing':
            entry['src'] = url
            if original.width > variants[-1][0]:
                entry['srcset'] += f', {url} {original.width}w'

        if getattr(original, 'is_animated', False):
            entry['poster'] = {'src': entry['src'], 'srcset': entry['srcset']}
            frames = [frame.convert('RGB') for frame in ImageSequence.Iterator(original)]
            durations = [frame.info.get('duration', 100) for frame in ImageSequence.Iterator(original)]
            target = destination / f'{source.stem}-animated.webp'
            frames[0].save(
                target, 'WEBP', save_all=True, append_images=frames[1:],
                duration=durations, loop=original.info.get('loop', 0), quality=80, method=6,
            )
            entry['src'] = '/' + target.relative_to(static).as_posix()
            entry['srcset'] = ''

        manifest[url] = entry
        print(f'{url}: {source.stat().st_size // 1024} KiB -> '
              f'{static.joinpath(entry["src"].lstrip("/")).stat().st_size // 1024} KiB')

(root / 'src/lib/data/marketing-images.json').write_text(json.dumps(manifest, indent=2) + '\n')

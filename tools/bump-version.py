"""Bump the ?v=N cache-buster on index.html and every js import, so phones never mix old and new files.
Run it before each push:  python3 tools/bump-version.py"""
import re, glob, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()
v = int(re.search(r'ui\.js\?v=(\d+)', html).group(1)) + 1
for f in [root / 'index.html', *map(pathlib.Path, glob.glob(str(root / 'js/*.js')))]:
    t = f.read_text()
    t = re.sub(r'(\.(?:js|css))\?v=\d+', rf'\1?v={v}', t)
    f.write_text(t)
print('version', v)

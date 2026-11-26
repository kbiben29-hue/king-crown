// Update the page in place instead of replacing it, so card pictures aren't re-created
// (which made the screen flash). Elements with data-uid / data-l / data-k are matched by
// that key, so a card that moves within a row keeps its loaded picture.
const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-uid') || n.getAttribute('data-l') || n.getAttribute('data-k') : null);

export function morph(el, html) {
  const t = document.createElement('div');
  t.innerHTML = html;
  patchChildren(el, t);
}

function patchChildren(a, b) {
  const want = [...b.childNodes];
  const keyed = new Map();
  for (const n of a.childNodes) { const k = keyOf(n); if (k != null) keyed.set(k, n); }
  let cur = a.firstChild;
  for (const nb of want) {
    const k = keyOf(nb);
    let match = null;
    if (k != null) {
      const cand = keyed.get(k);
      if (cand && cand.nodeName === nb.nodeName) { match = cand; keyed.delete(k); }
    } else if (cur && keyOf(cur) == null && cur.nodeName === nb.nodeName && cur.nodeType === nb.nodeType) match = cur;
    if (match) {
      if (match !== cur) a.insertBefore(match, cur);
      else cur = cur.nextSibling;
      patchNode(match, nb);
    } else a.insertBefore(nb, cur);
  }
  while (cur) { const next = cur.nextSibling; a.removeChild(cur); cur = next; }
}

function patchNode(a, b) {
  if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  for (const { name, value } of b.attributes) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  if (a.nodeName === 'IMG') return;
  patchChildren(a, b);
}

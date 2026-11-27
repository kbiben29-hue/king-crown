"""Builds js/cards.js from data/tokc-cards.json (the Eerie Card Library export).

    curl -o /tmp/raw.json https://cards.eerieidolgames.com/cards.min.json
    python3 tools/decode-library.py /tmp/raw.json data/tokc-cards.json
    python3 tools/build-cards.py
"""
import json, re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
cards = json.load(open(ROOT / 'data/tokc-cards.json', encoding='utf-8'))

ICON = {'VOTES': 'Vote', 'LORE': 'Lore', 'INFLUENCE': ' Influence', 'LORE_COST': 'Lore cost', 'HEIR': 'Heir', 'CAPTAIN': 'Captain',
        'FOLLOWER': 'Follower', 'CAVALRY': 'Cavalry', 'WAR_MACHINE': 'War Machine', 'AGENT': 'Agent', 'TRADER': 'Trader',
        'RUSE': 'Ruse', 'CHAMPION': 'Champion', 'CREATURE': 'Creature', 'WILD_KINGDOM': '', 'DAY': 'Day:', 'NIGHT': 'Night:', 'AUTUMN': 'Autumn:', 'SPRING': 'Spring:',
        'WINTER': 'Winter:', 'KINGDOMS_FAVOUR': "Kingdom's Favour", 'INVULNERABLE': 'Invulnerable', 'RESILIENT': 'Resilient',
        'PATHFINDER': 'Pathfinder', 'DIVIDER': '', 'COINS': 'Relics', 'BOOKS': 'Secrets', 'SWORDS': 'Oaths'}

def clean(t):
    t = (t or '').replace('<br>', '')
    t = re.sub(r'\{\{/?(b|lg|center)\}\}', '', t)
    t = re.sub(r'\[([A-Z_]+)\]', lambda m: ICON.get(m.group(1), m.group(1).title()), t)
    t = t.replace('&#8288;', '').replace('  ', ' ')
    return t.strip()

# Ability text that is printed on the card image but missing from the library's text field.
IMAGE_TEXT = {
    'AGENT': 'Night: If there are any Active opponent Followers in the Clash, Eliminate this card.',
    'UPRISING-16': 'Night: Eliminate all opponent Heirs/Captains in the current Clash. If at least one card was Eliminated this way, choose one: gain 1 Influence or gain 1 Lore.',
    'NOBILITY-16': 'Winter: If this card is in a Council, move it to another Council.',
    'NOBILITY-18': 'Winter: If you have two or more Supporters in this card\'s Region, place 1 Influence on this card.',
    'GATHERING-16': 'Winter: If this card is in a Council, place a Faction Marker on any Council. When this card is in a Council, each marker on a Council contributes 1 Vote to you. When this card is removed from a Council, you may move it to the Lost Pile.',
    'GATHERING-17': 'Day: Burn one of your cards in the Lost Pile. This card adds the Burned card\'s printed Strength, Traits, Commands and rules text to its own until the end of the Round.',
    'GATHERING-19': 'When you acquire this card, place three Faction Markers here. Day: Remove a marker from here to give one of your Active cards in the current Clash Ambush until the end of the Round. Then you may remove an additional marker to allow that card to Ambush with a card from your Discard Pile instead of your Hand.',
}
ROLE = {1: 'ruse', 2: 'trader', 3: 'follower1', 4: 'follower2', 5: 'follower3', 6: 'follower4', 7: 'agent', 8: 'cavalry',
        9: 'warmachine', 10: 'captain1', 11: 'captain2', 12: 'captain3', 13: 'captain4', 14: 'heir', 15: 'champion'}

def faction_card(x):
    t = x['text']
    g = lambda k: (re.search(k + r': ([^\n]*)', t) or [None, ''])[1]
    num = int(re.sub(r'\D', '', x['id'].split('-')[-1]))
    lines = [l for l in t.split('\n') if l and not re.match(r'(Strength|Archetype|Traits|Commands|Votes|Lore|Lore Cost):', l) and l != '<br>']
    text = clean(' '.join(lines))
    if num == 7 and not x['id'].startswith('WK'): text = IMAGE_TEXT['AGENT']
    if x['id'] in IMAGE_TEXT: text = IMAGE_TEXT[x['id']]
    cmds = []
    for c in re.findall(r'\[(DAY|NIGHT|AUTUMN|SPRING)\] ([A-Za-z]+)(?: \(([^)]*)\))?', g('Commands')):
        cmds.append({'season': c[0].lower(), 'cmd': c[1].lower(), 'arg': c[2]})
    cost = re.search(r'\{\{b\}\}(\d+)\{\{/b\}\}', g('Lore Cost'))
    s = g('Strength')
    return {
        'id': x['id'], 'name': x['name'], 'faction': x['id'].split('-')[0].lower(), 'num': num, 'role': ROLE.get(num, x['id'].lower()),
        'str': int(s) if s.strip().isdigit() else None,
        'arch': clean(g('Archetype')).split(' ')[-1].lower().replace('machine', 'warmachine') if g('Archetype') else None,
        'traits': [w.lower() for w in re.findall(r'\[(INVULNERABLE|RESILIENT|PATHFINDER)\]', g('Traits'))],
        'cmds': cmds, 'oneOf': ' OR' in g('Commands'),
        'votes': g('Votes').count('[VOTES]'), 'lore': g('Lore').count('[LORE]'),
        'cost': int(cost.group(1)) if cost else None, 'hq': s == '' and num >= 15,
        'text': text, 'flavour': x.get('flavour') or '', 'image': x['image'],
    }

fac = {}
for x in cards:
    if x['product'] == 'tokc-base-faction-cards':
        if x['id'].endswith('SITE-OF-POWER'):
            continue
        fac.setdefault(x['id'].split('-')[0].lower(), []).append(faction_card(x))
for f in fac.values():
    f.sort(key=lambda c: c['num'])
    for c in f:
        if c['arch'] == 'warmachine' or (c['arch'] or '').endswith('machine'): c['arch'] = 'warmachine'
sites = {x['id'].split('-')[0].lower(): {'name': x['name'], 'image': x['image']} for x in cards if x['id'].endswith('SITE-OF-POWER')}

def slug(n): return re.sub(r'[^a-z0-9]+', '-', n.lower().replace('’', '')).strip('-')
def rules(x):
    sr = x.get('seasonrules')
    if not sr: return []
    sr = sr if isinstance(sr, list) else [sr]
    return [{'season': r['season'].split(',')[0], 'text': clean(r['rules'])} for r in sr]

SUIT = {'[COINS]': 'relics', '[BOOKS]': 'secrets', '[SWORDS]': 'oaths'}
kingdom = []
for x in cards:
    if x['product'] == 'tokc-base-kingdom-cards':
        bold = re.findall(r'\{\{b\}\}([^{]*\.)\{\{/b\}\}', x.get('text') or '')
        kingdom.append({'id': x['id'], 'k': slug(x['name']), 'name': x['name'].replace('’', "'"), 'suit': SUIT[x['nameicon']],
                        'text': clean(x.get('text')), 'rules': rules(x), 'image': x['image'],
                        'bold': [clean(b) for b in bold if b.startswith(('Discard', 'Place', 'You may not'))]})
tactics = {}
favour = {}
for x in cards:
    if x['product'] == 'tokc-tactics-kingdoms-favour':
        f = x['tags'][1].lower()
        d = {'id': x['id'], 'k': slug(x['name']), 'name': x['name'].replace('  ', ' '), 'text': clean(x.get('text')), 'rules': rules(x), 'image': x['image']}
        (favour.__setitem__(f, d) if x['tags'][0] == "Kingdom's Favour" else tactics.setdefault(f, []).append(d))
mapcards = {slug(x['name']): {'name': x['name'], 'text': clean(x['text']).replace(' / ', ' '), 'image': x['image']}
            for x in cards if x['id'].startswith('MAP-BASE')}
councils = {x['id'].split('-')[-1].lower(): {'name': x['name'], 'text': clean(x.get('text')) or clean(rules(x)[0]['text'] if rules(x) else ''), 'image': x['image']}
            for x in cards if x['id'].startswith('COUNCIL-')}
for x in cards:
    if x['id'].startswith('COUNCIL-') and not clean(x.get('text')):
        councils[x['id'].split('-')[-1].lower()]['text'] = 'Autumn: ' + rules(x)[0]['text']

# ---- Wild Kingdom (Waking Kingdom) expansion
wk_fac = []
for x in cards:
    if x['product'] == 'tokc-wk-faction-cards':
        c = faction_card(x)
        c['faction'] = 'aeronauts' if 'Aeronauts' in x['tags'] else x['tags'][3].lower()
        c['legendary'] = 'Legendary Creatures' in x['tags']
        c['role'] = 'legendary' if c['legendary'] else c['name'].split()[0].lower()
        c['rules'] = rules(x)
        c['back'] = f"https://cards.eerieidolgames.com/cards/tokc/en-US/{x['backSide']}.webp"
        if c['arch'] and 'creature' in c['arch']: c['arch'] = 'creature'
        wk_fac.append(c)
wk_kingdom = []
for x in cards:
    if x['product'] == 'tokc-wk-kingdom-cards':
        bold = re.findall(r'\{\{b\}\}([^{]*\.)\{\{/b\}\}', x.get('text') or '')
        icon = x['nameicon'].replace('[WILD_KINGDOM]', '')
        wk_kingdom.append({'id': x['id'], 'k': slug(x['name']), 'name': x['name'].replace('’', "'"), 'suit': SUIT[icon], 'wk': True,
                           'text': clean(x.get('text')), 'rules': rules(x), 'image': x['image'],
                           'bold': [clean(b) for b in bold if b.startswith(('Discard', 'Place', 'Burn', 'You may not'))]})
boons = []
for x in cards:
    if 'Boon' in x['tags']:
        boons.append({'id': x['id'], 'n': int(x['id'][-2:]), 'text': clean(x.get('text')), 'rules': rules(x), 'image': x['image']})
night = {slug(x['name']): {'name': x['name'], 'image': x['image']} for x in cards if x['id'].startswith('MAP-NIGHT')}
tower = next({'image': x['image'], 'text': clean(x['text'])} for x in cards if x['id'] == 'WHISPERING-TOWER-TILE')
wk = {'factionCards': wk_fac, 'kingdom': wk_kingdom, 'boons': boons, 'night': night, 'tower': tower}

out = {'wk': wk, 'factions': fac, 'sites': sites, 'kingdom': kingdom, 'tactics': tactics, 'favour': favour, 'map': mapcards, 'councils': councils}
js = ('// Generated by tools/build-cards.py from data/tokc-cards.json (Eerie Card Library). Do not edit by hand.\n'
      '// Card text and images © Eerie Idol Games.\n'
      'export const CARDS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n')
(ROOT / 'js/cards.js').write_text(js, encoding='utf-8')
print('wild kingdom', len(wk_fac), len(wk_kingdom), len(boons), len(night)); print('factions', {k: len(v) for k, v in fac.items()}, 'kingdom', len(kingdom), 'tactics', {k: len(v) for k, v in tactics.items()}, 'favour', len(favour))

# Collects every German string the app can speak and renders it with a neural voice.
import json, glob, re, os, sys, asyncio
import edge_tts
ROOT = sys.argv[1]; OUT = os.path.join(ROOT, 'audio'); VOICE = 'de-DE-KatjaNeural'

def norm(t):
    t = re.sub(r'\s*\(.*?\)\s*', ' ', str(t or ''))
    return re.sub(r'\s+', ' ', t).strip()

def fnv(s):
    h = 0x811c9dc5
    for b in s.encode('utf-8'):
        h ^= b; h = (h * 0x01000193) & 0xffffffff
    return format(h, '08x')

S = set()
def add(t):
    t = norm(t)
    if t and re.search(r'[A-Za-zÄÖÜäöüß]', t): S.add(t)
first = lambda a: a[0] if isinstance(a, list) else a
for f in glob.glob(f'{ROOT}/content/lessons/*.json'):
    L = json.load(open(f))
    for v in L.get('vocab', []): add(v['de'])
    for p in L.get('examples', []) + L.get('phrases', []): add(p['de'])
    for x in L.get('exercises', []):
        t = x.get('type'); a = x.get('answer')
        if t == 'choice':
            if '___' in x['q'] or re.search(r'_{2,}', x['q']): add(re.sub(r'_{2,}', x['options'][a], x['q'], count=1))
        elif t == 'gap':
            add(re.sub(r'\s*\(.*?\)\s*$', '', re.sub(r'_{2,}', first(a), x['q'], count=1)))
        else: add(first(a))
for v in json.load(open(f'{ROOT}/content/extra/irregular.json')): add(f"{v['inf']}, {v['prat']}, {v['p2']}")
for v in json.load(open(f'{ROOT}/content/extra/government.json')): add(v['ex_de'])
for t in json.load(open(f'{ROOT}/content/extra/conversation.json')):
    for g in t.get('groups', []):
        for i in g['items']: add(i['de'])
    for p in t.get('practice', []): add(first(p['de']))
for t in json.load(open(f'{ROOT}/content/extra/tests.json')):
    for s in t['sections']:
        for i in s['items']: add(first(i['answer']))
add('Guten Tag! Wie geht es dir?')

keys = {}
for s in S:
    k = fnv(s)
    if k in keys and keys[k] != s: print('COLLISION', s, keys[k])
    keys[k] = s
print('strings', len(keys), flush=True)

async def one(k, s, sem, stats):
    path = os.path.join(OUT, k + '.mp3')
    if os.path.exists(path) and os.path.getsize(path) > 0: stats['skip'] += 1; return
    async with sem:
        for attempt in range(5):
            try:
                await edge_tts.Communicate(s, VOICE, rate='-5%').save(path)
                if os.path.getsize(path) > 0: stats['ok'] += 1; break
            except Exception as e:
                await asyncio.sleep(2 * (attempt + 1))
        else:
            stats['fail'] += 1
            if os.path.exists(path): os.remove(path)
    n = sum(stats.values())
    if n % 250 == 0: print('progress', n, stats, flush=True)

async def main():
    sem = asyncio.Semaphore(8); stats = {'ok': 0, 'skip': 0, 'fail': 0}
    await asyncio.gather(*(one(k, s, sem, stats) for k, s in keys.items()))
    have = sorted(k for k in keys if os.path.exists(os.path.join(OUT, k + '.mp3')))
    json.dump(have, open(os.path.join(OUT, 'index.json'), 'w'), separators=(',', ':'))
    print('DONE', stats, 'indexed', len(have), flush=True)
asyncio.run(main())

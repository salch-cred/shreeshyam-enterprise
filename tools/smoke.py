"""Smoke test for the Shree Shyam deployment.
Usage:  python tools/smoke.py https://<deployment>.vercel.app https://<api>.vercel.app
"""
import sys, urllib.request, json

site = (sys.argv[1] if len(sys.argv) > 1 else 'https://shreeshyamhardware.site').rstrip('/')
api = (sys.argv[2] if len(sys.argv) > 2 else '').rstrip('/')
fails = []

def get(url, markers=(), status=200):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'smoke/1'})
        body = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'ignore')
        if any(m not in body for m in markers):
            fails.append(url + ' :: missing ' + ','.join(m for m in markers if m not in body))
        print('OK  ', url)
    except Exception as e:
        fails.append(url + ' :: ' + str(e))
        print('FAIL', url, e)

get(site + '/', ['Shree Shyam', 'Polymatic', 'manifest.json'])
get(site + '/shop', ['cattile', 'shoplay', 'id="sort"', 'quick view' if False else 'smeter'])
get(site + '/checkout', ['costeps', 'Cash on delivery', 'trustchips'])
get(site + '/account', ['authSeg', 'bot.js'])
get(site + '/404.html', ['Wrong'])
get(site + '/admin.html', ['Open the console'])           # counter-only, must still serve
get(site + '/assets/styles.css?v=20261011h', ['.mnav', '.botpanel', '.mbg', 'safe-area-inset'])
get(site + '/assets/bot.js?v=20261011h', ['Shyam Assist', 'SSE_BOT_PROMPT'])
get(site + '/data/catalog-001.json', ['Polymatic'])
get(site + '/manifest.json', ['Shree Shyam'])
get(site + '/robots.txt', ['Disallow: /admin.html'])
get(site + '/sitemap.xml', ['shreeshyamhardware.site'])

if api:
    try:
        h = json.load(urllib.request.urlopen(api + '/health', timeout=30))
        print('OK   api/health', json.dumps(h))
        p = json.load(urllib.request.urlopen(api + '/payments/status', timeout=30))
        print('OK   api/payments/status', json.dumps(p))
    except Exception as e:
        fails.append('api :: ' + str(e)); print('FAIL api', e)

print('\n' + ('ALL GREEN' if not fails else str(len(fails)) + ' FAILURES:\n' + '\n'.join(fails)))
sys.exit(1 if fails else 0)

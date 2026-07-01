#!/usr/bin/env python3
"""
Bootstrap d'ingestion journalière MyPuls -> Supabase (grain JOUR).

Source = /team/money (transactions horodatées : creator_id, type, amount, message_id).
Avec start=<jour>&end=<demain> on a EXACTEMENT les transactions du jour (exact, pas de
cumul/diff). On pagine tout, on DUMPE le brut (pour être sûr : rien perdu, y compris
message_id pour l'attribution chatteur ultérieure), puis on agrège par modèle -> creator_daily.

Usage :  python3 apps/ingestion/scrape_day.py [YYYY-MM-DD]   (défaut = aujourd'hui)
Cron   :  59 23 * * *  (voir apps/ingestion/README-cron.md)

⚠️ Bootstrap autonome (urllib + psql, zéro install) pour fiabilité en cron.
Le journalier PAR CHATTEUR (join message_id -> sender) reste à transformer : ici on
dumpe le brut (message_id inclus). creator_daily (par modèle) est transformé, exact.
"""
import json, os, sys, time, subprocess, datetime, urllib.request, urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW_DIR = os.path.join(os.path.dirname(__file__), 'raw')
LOG_DIR = os.path.join(os.path.dirname(__file__), 'logs')
PSQL = '/opt/homebrew/opt/postgresql@15/bin/psql'

day = datetime.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else datetime.date.today()
tomorrow = day + datetime.timedelta(days=1)

os.makedirs(RAW_DIR, exist_ok=True); os.makedirs(LOG_DIR, exist_ok=True)
_logf = open(os.path.join(LOG_DIR, f'{day}.log'), 'a')
def log(*a):
    line = f'[{datetime.datetime.now().isoformat(timespec="seconds")}] ' + ' '.join(str(x) for x in a)
    print(line); _logf.write(line + '\n'); _logf.flush()

env = {}
for ln in open(os.path.join(ROOT, '.env')):
    ln = ln.strip()
    if ln and not ln.startswith('#') and '=' in ln:
        k, v = ln.split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
API, TOKEN, DBURL = env.get('MYPULS_API_BASE', 'https://mypuls.app/api/v1'), env.get('MYPULS_API_KEY'), env.get('DATABASE_URL')

def get(path, params=None, tries=3):
    url = API + path + ('?' + urllib.parse.urlencode(params) if params else '')
    for t in range(tries):
        try:
            req = urllib.request.Request(url, headers={'X-API-TOKEN': TOKEN, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            log(f'  ! {path} tentative {t+1}: {e}'); time.sleep(3)
    return None

def get_all(path, params):
    """Récupère toutes les pages si l'endpoint est paginé."""
    p = dict(params); p['per_page'] = 100; p['page'] = 1
    first = get(path, p)
    if not isinstance(first, dict) or 'pagination' not in first:
        return first
    data = list(first.get('data', []))
    pages = first['pagination'].get('total_pages', 1)
    meta = {k: v for k, v in first.items() if k != 'data'}
    for pg in range(2, pages + 1):
        p['page'] = pg; r = get(path, p)
        if isinstance(r, dict): data += r.get('data', [])
        time.sleep(0.25)
    return {'data': data, **meta, 'fetched_pages': pages}

def psql(sql, read=False):
    args = [PSQL, DBURL, '-v', 'ON_ERROR_STOP=1'] + (['-tAc', sql] if read else ['-q', '-c', sql])
    r = subprocess.run(args, capture_output=True, text=True, timeout=90)
    if r.returncode != 0: log('  ! psql:', r.stderr.strip()[:300])
    return r.stdout

# ── 1) DUMP BRUT (priorité : rien perdu) ─────────────────────────
log(f'=== ingestion {day} (start={day} end={tomorrow}) ===')
raw = {'date': str(day), 'fetched_at': datetime.datetime.now().isoformat()}
raw['creators'] = get('/creators')
raw['users'] = get('/users')
raw['team_money'] = get_all('/team/money', {'start': str(day), 'end': str(tomorrow)})
raw['team_messages_stats'] = get_all('/team/messages/stats', {'start': str(day), 'end': str(tomorrow)})
raw_path = os.path.join(RAW_DIR, f'{day}.json')
json.dump(raw, open(raw_path, 'w'), ensure_ascii=False, indent=1)
tx = (raw['team_money'] or {}).get('data', []) if isinstance(raw['team_money'], dict) else []
log(f'brut dumpé -> {raw_path} | {len(tx)} transactions team/money')

# ── 2) TRANSFORM creator_daily (par modèle, exact) ───────────────
if not DBURL:
    log('DATABASE_URL absent — transform sautée (brut sauvegardé).'); sys.exit(0)

rows = [l.split('|') for l in psql("select id, name, is_private from creators;", read=True).splitlines() if l]
name_to_id = {n: i for i, n, _ in rows}
mains = [n for i, n, p in rows if p == 'f']
PRIV = {'alice_prvv': 'Alice (privé)', 'carlaprive': 'Carla (privé)', 'juliepvv': 'Julie (privé)'}
def pseudo_to_name(ps):
    p = (ps or '').lower()
    return PRIV.get(p) or next((n for n in mains if n.lower() in p), None)

agg = {}
for t in tx:
    name = pseudo_to_name(t.get('creator'))
    if not name: continue
    a = agg.setdefault(name, {'ca': 0.0, 'ppv': 0.0, 'tips': 0.0, 'renew': 0.0})
    amt = float(t.get('amount') or 0); typ = t.get('type')
    a['ca'] += amt
    if typ == 'Média privé': a['ppv'] += amt
    elif typ == 'Pourboires': a['tips'] += amt
    elif typ == 'Renouvellement abonnement': a['renew'] += amt

vals = [f"('{name_to_id[n]}','{day}',{round(a['ca'],2)},{round(a['ppv'],2)},"
        f"{round(a['tips'],2)},{round(a['renew'],2)},0,0)"
        for n, a in agg.items() if n in name_to_id]
if vals:
    psql("insert into creator_daily (creator_id,date,ca,ca_ppv,ca_tips,ca_renew,subs_active,new_subs) values "
         + ",".join(vals) + " on conflict (creator_id,date) do update set ca=excluded.ca, "
         "ca_ppv=excluded.ca_ppv, ca_tips=excluded.ca_tips, ca_renew=excluded.ca_renew;")
    tot = psql(f"select to_char(sum(ca),'999G999D99') from creator_daily where date='{day}';", read=True).strip()
    log(f'creator_daily {day}: {len(vals)} modèles | CA jour = {tot}')
else:
    log(f'creator_daily {day}: 0 ligne (aucune transaction) — brut conservé.')
log('=== fin ===')

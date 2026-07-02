#!/usr/bin/env python3
"""
Ingestion journalière MyPuls -> Supabase (grain JOUR), auto-cicatrisante.

Source = /team/money (transactions horodatées : creator_id, type, amount, message_id).
start=<jour>&end=<demain> -> transactions EXACTES du jour (pas de cumul/diff), paginé.
On DUMPE le brut (raw/<date>.json, message_id inclus) puis on agrège par modèle -> creator_daily.

Usage :
  python3 scrape_day.py               # CATCH-UP : backfill tous les jours manquants -> hier
  python3 scrape_day.py 2026-07-01    # un jour précis
  python3 scrape_day.py --catchup     # idem défaut

Le mode catch-up lit max(date) en base et rattrape jusqu'à hier -> aucun trou même si
la machine a dormi plusieurs jours. Planifié via launchd (voir README-cron.md).
"""
import json, os, sys, time, subprocess, datetime, urllib.request, urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW_DIR = os.path.join(os.path.dirname(__file__), 'raw')
LOG_DIR = os.path.join(os.path.dirname(__file__), 'logs')
PSQL = '/opt/homebrew/opt/postgresql@15/bin/psql'
MAX_CATCHUP = 60  # garde-fou

os.makedirs(RAW_DIR, exist_ok=True); os.makedirs(LOG_DIR, exist_ok=True)
_logf = open(os.path.join(LOG_DIR, 'ingestion.log'), 'a')
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
    p = dict(params); p['per_page'] = 100; p['page'] = 1
    first = get(path, p)
    if not isinstance(first, dict) or 'pagination' not in first:
        return first
    data = list(first.get('data', []))
    meta = {k: v for k, v in first.items() if k != 'data'}
    for pg in range(2, first['pagination'].get('total_pages', 1) + 1):
        p['page'] = pg; r = get(path, p)
        if isinstance(r, dict): data += r.get('data', [])
        time.sleep(0.25)
    return {'data': data, **meta, 'fetched_pages': first['pagination'].get('total_pages', 1)}

def psql(sql, read=False):
    args = [PSQL, DBURL, '-v', 'ON_ERROR_STOP=1'] + (['-tAc', sql] if read else ['-q', '-c', sql])
    r = subprocess.run(args, capture_output=True, text=True, timeout=120)
    if r.returncode != 0: log('  ! psql:', r.stderr.strip()[:300])
    return r.stdout

PRIV = {'alice_prvv': 'Alice (privé)', 'carlaprive': 'Carla (privé)', 'juliepvv': 'Julie (privé)'}
def creator_map():
    rows = [l.split('|') for l in psql("select id, name, is_private from creators;", read=True).splitlines() if l]
    name_to_id = {n: i for i, n, _ in rows}
    mains = [n for i, n, p in rows if p == 'f']
    def pseudo_to_name(ps):
        p = (ps or '').lower()
        return PRIV.get(p) or next((n for n in mains if n.lower() in p), None)
    return name_to_id, pseudo_to_name

def ingest_day(day, name_to_id, pseudo_to_name):
    tomorrow = day + datetime.timedelta(days=1)
    log(f'--- {day} (start={day} end={tomorrow}) ---')
    raw = {'date': str(day), 'fetched_at': datetime.datetime.now().isoformat()}
    raw['creators'] = get('/creators'); raw['users'] = get('/users')
    raw['team_money'] = get_all('/team/money', {'start': str(day), 'end': str(tomorrow)})
    raw['team_messages_stats'] = get_all('/team/messages/stats', {'start': str(day), 'end': str(tomorrow)})
    json.dump(raw, open(os.path.join(RAW_DIR, f'{day}.json'), 'w'), ensure_ascii=False, indent=1)
    tx = (raw['team_money'] or {}).get('data', []) if isinstance(raw['team_money'], dict) else []

    agg = {}
    for t in tx:
        n = pseudo_to_name(t.get('creator'))
        if not n: continue
        a = agg.setdefault(n, {'ca': 0.0, 'ppv': 0.0, 'tips': 0.0, 'renew': 0.0})
        amt = float(t.get('amount') or 0); typ = t.get('type')
        a['ca'] += amt
        if typ == 'Média privé': a['ppv'] += amt
        elif typ == 'Pourboires': a['tips'] += amt
        elif typ == 'Renouvellement abonnement': a['renew'] += amt
    vals = [f"('{name_to_id[n]}','{day}',{round(a['ca'],2)},{round(a['ppv'],2)},{round(a['tips'],2)},"
            f"{round(a['renew'],2)},0,0)" for n, a in agg.items() if n in name_to_id]
    if vals:
        psql("insert into creator_daily (creator_id,date,ca,ca_ppv,ca_tips,ca_renew,subs_active,new_subs) values "
             + ",".join(vals) + " on conflict (creator_id,date) do update set ca=excluded.ca, "
             "ca_ppv=excluded.ca_ppv, ca_tips=excluded.ca_tips, ca_renew=excluded.ca_renew;")
    tot = psql(f"select to_char(coalesce(sum(ca),0),'999G999D99') from creator_daily where date='{day}';", read=True).strip()
    log(f'    {len(tx)} tx -> {len(vals)} modèles | CA {day} = {tot}')

def main():
    if not DBURL:
        log('DATABASE_URL absent — abandon.'); return
    today = datetime.date.today(); yest = today - datetime.timedelta(days=1)
    args = [a for a in sys.argv[1:] if a != '--catchup']
    name_to_id, pseudo_to_name = creator_map()
    if args:  # jour explicite
        days = [datetime.date.fromisoformat(args[0])]
    else:     # jours complets manqués (max+1 .. hier) + aujourd'hui (partiel, ré-capturé complet demain)
        mx = psql("select max(date) from creator_daily;", read=True).strip()
        start = (datetime.date.fromisoformat(mx) + datetime.timedelta(days=1)) if mx else yest
        missed = [start + datetime.timedelta(days=i) for i in range((yest - start).days + 1)] if start <= yest else []
        if len(missed) > MAX_CATCHUP:
            log(f'{len(missed)} jours manquants > garde-fou {MAX_CATCHUP} — limité aux {MAX_CATCHUP} plus récents')
            missed = missed[-MAX_CATCHUP:]
        days = missed + [today]
    log(f'=== ingestion (catch-up {len(days)} jour(s)) ===' if not args else '=== ingestion (jour explicite) ===')
    if not days:
        log('déjà à jour, rien à faire.')
    for d in days:
        ingest_day(d, name_to_id, pseudo_to_name)
    log('=== fin ===')

main()

# E9 突變驗紅：git archive 副本上逐項突變 → 跑對應檢查（應紅）→ 以備份副本還原並比 sha1
import hashlib, json, os, re, shutil, subprocess, sys
SP = r'C:\Users\shung\AppData\Local\Temp\claude\C--Users-shung\b611e1c3-cb6d-40b3-94b3-ee053003c6ba\scratchpad'
D = os.path.join(SP, 'motion-mut', 'e9')
WT = r'C:\Users\shung\worktrees\volleyball-motion'
REV = sys.argv[1]
F = os.path.join(D, 'src', 'render', 'geoAnimator.js')
env = dict(os.environ, MOTION_2B_GIT_DIR=WT)
out = {'rev': REV, 'runs': []}

def sh(cmd, cwd=D):
    r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', shell=True, timeout=1500)
    return r.returncode, r.stdout + r.stderr

def sha(p): return hashlib.sha1(open(p, 'rb').read()).hexdigest()

if os.path.exists(D): shutil.rmtree(D)
os.makedirs(D)
import zipfile
ZIP = os.path.join(SP, 'e9-archive.zip')
subprocess.run(['git', 'archive', '--format=zip', '-o', ZIP, REV], cwd=WT, check=True)
zipfile.ZipFile(ZIP).extractall(D)
subprocess.run(['powershell', '-NoProfile', '-Command', f"New-Item -ItemType Junction -Path '{D}\\node_modules' -Target 'C:\\Users\\shung\\OneDrive\\桌面\\排球夢\\node_modules' | Out-Null"], check=True)
ORIG = sha(F)
base_src = subprocess.run(f'git show f4ccbec:src/render/geoAnimator.js', cwd=WT, shell=True, capture_output=True, text=True, encoding='utf-8').stdout
LIST25 = 'bumpReady bumpHit setReach setPush spikeWind spikeUnlock spikeHit spikeFollow windup approachBack approachDrive landDeep landRise diveReach diveSprawl divePush serveReady floatWind floatPush gasp dejected waveUp waveSide blockLoad windupHesitant'.split()

def pose_block(src, k):
    m = re.search(r'\n  ' + k + r': \{(.*?)\},\n', src, re.S)
    return m

def revert_mirror(s):
    for k in LIST25:
        b = pose_block(base_src, k).group(1)
        m = pose_block(s, k)
        body = m.group(1)
        for arm in ('rSh', 'lSh'):
            z = re.search(arm + r': \[[^,]+, ([^\]]+)\]', b).group(1)
            body = re.sub(arm + r': \[([^,]+), [^\]]+\]', lambda mm: f'{arm}: [{mm.group(1)}, {z}]', body)
        for f in ('pelvisY', 'chestY'):
            v = re.search(f + r': ([-0-9.]+)', b)
            if v and re.search(f + r': ', body): body = re.sub(f + r': [-0-9.]+', f'{f}: {v.group(1)}', body)
            elif v: body = body.rstrip() + f', {f}: {v.group(1)} '
        s = s[:m.start(1)] + body + s[m.end(1):]
    return s

def set_el(pose, val):
    def f(s):
        m = pose_block(s, pose)
        body = re.sub(r'rEl: [-0-9.]+', f'rEl: {val}', m.group(1), count=1)
        return s[:m.start(1)] + body + s[m.end(1):]
    return f

def revert_e6(s):
    a = "        if (current) {\n          const { seq } = current;\n          const total = seq.dur + current.sustain;"
    assert s.count(a) == 1
    return s.replace(a, "        if (current && current.t > 0) {\n          const { seq } = current;\n          const total = seq.dur + current.sustain;")

MUTS = [
    ('撤銷鏡像修正（25 姿勢肩 z／pelvisY／chestY 回 f4ccbec）', revert_mirror, 'e1', None),
    ('低手 bump.start.elbow：bumpReady rEl −0.36→−0.6496（+16.59°）', set_el('bumpReady', -0.6496), 'd0', 'bump.start.elbow'),
    ('高手 set.load.elflex：setReach rEl −1.75→−2.0118（+15°）', set_el('setReach', -2.0118), 'd0', 'set.load.elflex'),
    ('扣球 spike.hit.elflex：spikeHit rEl −0.6→−0.8618（+15°）', set_el('spikeHit', -0.8618), 'd0', 'spike.hit.elflex'),
    ('吊球 tip.hit.elflex：tipHit rEl −0.75→−0.4533（−17°）', set_el('tipHit', -0.4533), 'd0', 'tip.hit.elflex'),
    ('跳發 servejump.hit.elflex：spikeHit rEl −0.6→−0.059（−31°）', set_el('spikeHit', -0.059), 'd0', 'servejump.hit.elflex'),
    ('飄球 servefloat.hit.elflex：floatPush rEl −0.87→−0.486（−22°）', set_el('floatPush', -0.486), 'd0', 'servefloat.hit.elflex'),
    ('過渡空窗改回（接續那一幀不產生姿勢）', revert_e6, 'e6', None),
]
d0json = os.path.join(D, 'docs', 'experiments', 'motion-d0-measure.json')
for name, fn, kind, row in MUTS:
    bak = F + '.bak'
    shutil.copyfile(F, bak)
    src = open(F, encoding='utf-8').read()
    new = fn(src)
    assert new != src, name
    open(F, 'w', encoding='utf-8', newline='\n').write(new)
    rec = {'mutation': name, 'kind': kind}
    if kind == 'e1':
        c1, o1 = sh('node tools/motion-d0-measure.mjs')
        c, o = sh(f'node tools/motion-2b-e1-mirror.mjs --d0-json "{d0json}" --restore-only-json "{os.path.join(SP, "d0-restore-only.json")}"')
        rec.update(exit=c, red=c != 0, tail=[l for l in o.splitlines() if 'FAIL' in l or '總判定' in l][:30])
    elif kind == 'd0':
        c, o = sh('node tools/motion-d0-measure.mjs')
        j = json.load(open(d0json, encoding='utf-8'))
        r = next(x for x in j['rows'] if x['id'] == row)
        st = j['selftest']
        rec.update(row=row, current=r['current'], lit=r['lit']['mean'], tol=r['tol'], out=r['out'], red=r['out'] is True,
                   selftestPass=sum(1 for t in st if t['ok']), selftestTotal=len(st))
    else:
        c, o = sh('node tools/motion-2b-check.mjs --only e6')
        rec.update(exit=c, red=c != 0, tail=[l for l in o.splitlines() if l.startswith('[E6]')])
    shutil.copyfile(bak, F)
    os.remove(bak)
    rec['restoredSha1Match'] = sha(F) == ORIG
    out['runs'].append(rec)
    print(json.dumps(rec, ensure_ascii=False))
# 健康對照：未突變的副本 E1、E6、D0 選定列皆綠，D0 自我檢查 24 項
c, o = sh('node tools/motion-d0-measure.mjs')
j = json.load(open(d0json, encoding='utf-8'))
out['healthy'] = {'d0SelftestPass': sum(1 for t in j['selftest'] if t['ok']), 'd0SelftestTotal': len(j['selftest']),
                  'rowsOut': [r['id'] for r in j['rows'] if r['kind'] == 'angle' and r['out']]}
c1, _ = sh(f'node tools/motion-2b-e1-mirror.mjs --d0-json "{d0json}" --restore-only-json "{os.path.join(SP, "d0-restore-only.json")}"')
c2, _ = sh('node tools/motion-2b-check.mjs --only e6')
out['healthy'].update(e1Exit=c1, e6Exit=c2)
out['origSha1'] = ORIG
print(json.dumps(out['healthy'], ensure_ascii=False))
json.dump(out, open(os.path.join(SP, 'e9-result.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

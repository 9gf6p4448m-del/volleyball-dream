# Apply one named mutation to a git-archive copy of the tree (never the real
# worktree). Restore = copy the pristine file back from the backup copy and
# compare sha1 (no reverse sed). Usage: python mutate.py <copy root> <name> | restore
import sys, shutil, hashlib, pathlib
root = pathlib.Path(sys.argv[1]); name = sys.argv[2]
RULES = root / 'src/sim/directReceiveRules.js'
CONST = root / 'src/sim/directConstants.js'
PASS = root / 'tests/direct-pass.test.js'
BACKUP = root.parent / (root.name + '-backup')
sha = lambda p: hashlib.sha1(p.read_bytes()).hexdigest()

def patch(path, old, new):
    s = path.read_text(encoding='utf-8')
    assert s.count(old) == 1, f'{path}: pattern count {s.count(old)}'
    path.write_text(s.replace(old, new), encoding='utf-8')

if name == 'restore':
    for rel in ['src/sim/directReceiveRules.js', 'src/sim/directConstants.js', 'tests/direct-pass.test.js']:
        shutil.copyfile(BACKUP / rel, root / rel)
        print(rel, 'restored', sha(root / rel) == sha(BACKUP / rel))
    sys.exit(0)

if name == 'q5-lower-bound':  # any dive press takes the dive judgement (lower bound gone)
    patch(RULES, "if (p.action === 'dive' && p.diveTarget?.stage === 'dive') return", "if (p.action === 'dive' && p.diveTarget) return")
elif name == 'q5-literal':  # the frozen text read literally: lower bound = d(0.3 m) > 0.5 (a slanted ball coming in is refused)
    patch(RULES, "if (reach && reach.d <= reach.radius) return { stage: 'dive', technique: 'dive', ...reach };", "if (reach && reach.d > underRadius(s) && reach.d <= reach.radius) return { stage: 'dive', technique: 'dive', ...reach };")
elif name == 'gate':  # re-add the old platformDistance gate to judgeDive
    patch(RULES, "  const d = target.d, radius = target.radius;\n", "  const d = Math.max(target.d, platformDistance(pose, b)), radius = target.radius;\n")
    patch(RULES, "function judgeDive(s, pose) {", """function platformDistance(pose, b) {
  let best = Infinity;
  for (const q of pose) {
    if (q.part !== 'forearm') continue;
    const dx = q.b.x - q.a.x, dz = q.b.z - q.a.z, l2 = dx * dx + dz * dz;
    const u = l2 > 1e-12 ? Math.max(0, Math.min(1, ((b.x - q.a.x) * dx + (b.z - q.a.z) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(b.x - (q.a.x + dx * u), b.z - (q.a.z + dz * u)));
  }
  return best > A.underRadius ? Infinity : 0;
}
function judgeDive(s, pose) {""")
elif name == 'q6-1.5':  # dive multiplier back to 1.5
    patch(CONST, "diveErrorMultiplier: 1.05,", "diveErrorMultiplier: 1.5,")
elif name == 'q2-auto-dive':  # a receive press at a ball in the band is upgraded to a dive
    patch(RULES, "  const d = Math.hypot(b.x - point.x, b.z - point.z);\n  if (d > radius) return null;\n  const speed = Math.hypot(b.vx, b.vy, b.vz), k = windowScale(speed);\n  const offset = receiveOffset(s);",
          "  const d = Math.hypot(b.x - point.x, b.z - point.z);\n  const speed = Math.hypot(b.vx, b.vy, b.vz), k = windowScale(speed);\n  const offset = receiveOffset(s);\n  if (d > radius && technique === 'underhand' && offset !== null && d <= radius + R.diveReach) return pass(s, pose, { technique: 'dive', tier: 'GOOD', offset, ratio: d / (radius + R.diveReach), speed });\n  if (d > radius) return null;")
elif name == 'r6-pressed-body':  # pressed touches also snap to any body part
    patch(RULES, "  const snapped = snapToBody(s, pose);\n  const bodySpeed", "  const snapped = snapToBody(s, pose, null);\n  const bodySpeed")
    patch(RULES, "snapToBody(s, pose, timing === 'none' ? null : ARMS)", "snapToBody(s, pose, null)")
elif name == 'a14-whole-action':  # denominator back to the whole action period (b06df69's test file)
    import subprocess
    old = subprocess.run(['git', '-C', sys.argv[3], 'show', 'b06df69:tests/direct-pass.test.js'], capture_output=True, check=True).stdout
    PASS.write_bytes(old)
else:
    raise SystemExit('unknown mutation ' + name)
print('applied', name)

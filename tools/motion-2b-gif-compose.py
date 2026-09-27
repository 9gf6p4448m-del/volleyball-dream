"""寫實球員卷 2B 自然度：把 tools/motion-2b-gif.mjs 的逐幀截圖合成三欄對照 GIF。

用法：python tools/motion-2b-gif-compose.py <逐幀資料夾> <輸出資料夾> [參考照 manifest.json]
每個情境一張 GIF：欄＝版本（改前／2B 現況／本輪），列＝幾何、寫實；給了參考照 manifest
就在最左邊加一欄「真人參考」靜圖（該輸出只能放 repo 外——參考照不進 repo）。
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FRAMES = Path(sys.argv[1])
OUT = Path(sys.argv[2])
REF_MANIFEST = Path(sys.argv[3]) if len(sys.argv) > 3 else None
OUT.mkdir(parents=True, exist_ok=True)
meta = json.loads((FRAMES / 'frames.json').read_text(encoding='utf-8'))
labels = [s['label'] for s in meta['sources']]
CELL_W, CELL_H = 195, 422  # 直式 390×844 的一半
HEAD = 34
try:
    FONT = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 15)
except OSError:
    FONT = ImageFont.load_default()
refs = json.loads(REF_MANIFEST.read_text(encoding='utf-8')) if REF_MANIFEST else []


# 扣球放兩張：引臂拉弓（上）＋擊球（下）；其餘一張
REF_KEYS = {'spike': ['spikeWind', 'spike'], 'bump': ['bump'], 'servejump': ['servejump']}


def ref_image(scn):
    picks = []
    for key in REF_KEYS[scn]:
        cands = [r for r in refs if r['technique'] == key]
        if cands:
            picks.append(cands[0])
    if not picks:
        return None, None
    box_h = CELL_H * 2 // len(picks)
    ims = []
    for r in picks:
        im = Image.open(REF_MANIFEST.parent / r['file']).convert('RGB')
        im.thumbnail((CELL_W * 2, box_h))
        ims.append(im)
    w = max(i.width for i in ims)
    col = Image.new('RGB', (w, CELL_H * 2), (13, 17, 25))
    for k, im in enumerate(ims):
        col.paste(im, ((w - im.width) // 2, k * box_h + (box_h - im.height) // 2))
    return col, {'file': '、'.join(r['file'] for r in picks)}


for scn in meta['scenarios']:
    seqs = {}
    for vi in range(len(labels)):
        for kind in ('geo', 'real'):
            seqs[(vi, kind)] = sorted((FRAMES / str(vi) / f'{scn}-{kind}').glob('*.png'))
    n = max(len(v) for v in seqs.values())
    ref, rmeta = ref_image(scn) if refs else (None, None)
    ref_w = ref.width if ref is not None else 0
    W = ref_w + CELL_W * len(labels)
    H = HEAD + CELL_H * 2
    frames = []
    for f in range(n):
        canvas = Image.new('RGB', (W, H), (13, 17, 25))
        d = ImageDraw.Draw(canvas)
        if ref is not None:
            canvas.paste(ref, (0, HEAD + (CELL_H * 2 - ref.height) // 2))
            d.text((6, 8), '真人參考（靜圖）', fill=(238, 242, 250), font=FONT)
        for vi, lab in enumerate(labels):
            x = ref_w + vi * CELL_W
            d.text((x + 6, 8), lab, fill=(238, 242, 250), font=FONT)
            for ri, kind in enumerate(('geo', 'real')):
                lst = seqs[(vi, kind)]
                if not lst:
                    continue
                im = Image.open(lst[min(f, len(lst) - 1)]).convert('RGB').resize((CELL_W, CELL_H))
                canvas.paste(im, (x, HEAD + ri * CELL_H))
        frames.append(canvas.quantize(colors=128, method=Image.Quantize.MEDIANCUT))
    name = f'{scn}{"-ref" if ref is not None else ""}.gif'
    frames[0].save(OUT / name, save_all=True, append_images=frames[1:], duration=33, loop=0, optimize=True)
    print(f'[compose] {name}：{n} 幀、{(OUT / name).stat().st_size / 1e6:.2f} MB' + (f'；參考 {rmeta["file"]}' if rmeta else ''))

# 魚躍提案比較圖合成（Python + Pillow）：吃 tools/dive-proposal-shots.mjs 的截圖輸出
# 用法：python tools/dive-proposal-sheet.py <截圖目錄> <輸出目錄>
# 產出：dive-compare-portrait.png（直式 390×844 裁中段）、dive-compare-desktop.png（桌機 1280×720 裁中段）、
#       dive-geo.gif／dive-real.gif（直式全幀，現行｜A｜B｜C 四欄同步播放；需先拍 frames=all）
import os
import sys
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
FONT = 'C:/Windows/Fonts/msjhbd.ttc'
f_big = ImageFont.truetype(FONT, 30)
f_mid = ImageFont.truetype(FONT, 22)
f_small = ImageFont.truetype(FONT, 17)

COLS = [
    ('now', '現行（對照）', '07-23 版：前撲 1.35m＋前傾 1.2rad'),
    ('a', 'A sprawl 滑撲', '弓步壓低→雙臂平台貼地前滑'),
    ('b', 'B pancake 手掌貼地', '低平飛撲→單手伸最遠貼地'),
    ('c', 'C 依球高：高球', '球高 0.45m 以上：跨步平台墊→趴地'),
    ('c-low', 'C 依球高：貼地球', '球高<0.45m：改走 B'),
]
PHASES = [(2, '起動'), (4, '撲出'), (6, '觸球'), (18, '著地滑行'), (28, '撐地收腿'), (34, '起身')]
CROPS = {'portrait': (0, 285, 390, 575), 'desktop': (360, 225, 1000, 455)}
SCALE = {'portrait': 0.8, 'desktop': 0.62}
BG = (18, 20, 28)
FG = (238, 242, 250)
MUTED = (160, 168, 185)


def cell(view, style, fig, frame):
    im = Image.open(f'{src}/{view}/{style}-{fig}-side-f{frame:02d}.png').convert('RGB').crop(CROPS[view])
    s = SCALE[view]
    return im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)


def sheet(view):
    sample = cell(view, 'a', 'geo', 2)
    cw, ch = sample.size
    label_w, head_h, gap = 120, 96, 6
    W = label_w + len(COLS) * (cw + gap)
    H = head_h + len(PHASES) * (2 * ch + gap + 4) + 60
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    for c, (_, title, sub) in enumerate(COLS):
        x = label_w + c * (cw + gap)
        d.text((x + 6, 10), title, font=f_mid, fill=FG)
        d.text((x + 6, 44), sub, font=f_small, fill=MUTED)
    d.text((8, 12), '階段', font=f_mid, fill=FG)
    d.text((8, 44), '上幾何人\n下寫實人', font=f_small, fill=MUTED)
    for r, (frame, name) in enumerate(PHASES):
        y = head_h + r * (2 * ch + gap + 4)
        d.text((8, y + ch - 30), name, font=f_mid, fill=FG)
        d.text((8, y + ch + 2), f'第 {frame} 幀\n{frame / 60:.2f}s', font=f_small, fill=MUTED)
        for c, (style, _, _) in enumerate(COLS):
            x = label_w + c * (cw + gap)
            img.paste(cell(view, style, 'geo', frame), (x, y))
            img.paste(cell(view, style, 'real', frame), (x, y + ch + 2))
    d.text((8, H - 48), f'魚躍提案比較（{"直式 390×844" if view == "portrait" else "桌機 1280×720"}，側面鏡頭，60fps 逐幀；'
           'sim 觸球在第 0 幀，「觸球」列是動畫的觸球關鍵幀 0.10s）', font=f_small, fill=MUTED)
    d.text((8, H - 26), '?mode=divelab&dive=now|a|b|c（&ball=0.2 看 C 貼地球、&fig=real 寫實人）；比賽中 ?dive=a|b|c',
           font=f_small, fill=MUTED)
    path = f'{out}/dive-compare-{view}.png'
    img.save(path, optimize=True)
    print(path, img.size)


def gif(fig):
    styles = [c for c in COLS if c[0] != 'c-low']
    frames = []
    for f in range(44):
        cells = []
        for style, title, _ in styles:
            p = f'{src}/portrait/{style}-{fig}-side-f{f:02d}.png'
            if not os.path.exists(p):
                return
            im = Image.open(p).convert('RGB').crop(CROPS['portrait'])
            im = im.resize((int(im.width * 0.6), int(im.height * 0.6)), Image.LANCZOS)
            cells.append((im, title))
        w, h = cells[0][0].size
        fr = Image.new('RGB', (w * len(cells), h + 30), BG)
        d = ImageDraw.Draw(fr)
        for i, (im, title) in enumerate(cells):
            fr.paste(im, (i * w, 30))
            d.text((i * w + 4, 4), title, font=f_small, fill=FG)
        d.text((w * len(cells) - 70, 4), f'f{f:02d}', font=f_small, fill=MUTED)
        frames.append(fr.quantize(colors=128))
    # 60fps 逐幀，GIF 以 2 幀一格（約 30fps）播放，尾端停 0.6 s
    seq = frames[::2]
    dur = [33] * (len(seq) - 1) + [600]
    path = f'{out}/dive-{fig}.gif'
    seq[0].save(path, save_all=True, append_images=seq[1:], duration=dur, loop=0, optimize=True)
    print(path)


for v in ('portrait', 'desktop'):
    if os.path.isdir(f'{src}/{v}'):
        sheet(v)
for fig in ('geo', 'real'):
    gif(fig)

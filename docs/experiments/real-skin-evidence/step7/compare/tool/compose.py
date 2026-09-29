# 四欄並排：raw/<欄>-<名稱>.png → ../<名稱>.png；近拍另列各欄 S14 δ 最大值（紅點＝位置）
# 用法：python compose.py <dump 資料夾（讀 manifest.json）>
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here); raw = os.path.join(root, 'raw')
man = json.load(open(os.path.join(sys.argv[1], 'manifest.json'), encoding='utf8'))
font = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 28); small = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 21)
COLORS = {'cur': (255, 200, 120), 's3': (150, 255, 160), 'dqs': (140, 220, 255), 'dqsc': (210, 170, 255)}
CLOSE = {'1b-扣球引臂-K1a-左臂胸口近拍', '5b-待命接球-K4b-腋下近拍'}
for s in man['shots']:
    ims = [Image.open(os.path.join(raw, f"{c['id']}-{s['name']}.png")).convert('RGB') for c in man['cols']]
    W, H = ims[0].size; close = s['name'] in CLOSE; head = 150 if close else 92
    out = Image.new('RGB', (W * 4 + 36, H + head), (20, 24, 34)); d = ImageDraw.Draw(out)
    d.text((14, 6), f"{s['name']}（{man['faces']}；四欄同一條 makeReal→driveKey 姿勢、同一繪製路徑）", font=font, fill=(240, 240, 240))
    for k, c in enumerate(man['cols']):
        x = k * (W + 12) + 12
        d.text((x, 50), c['label'], font=small, fill=COLORS[c['id']])
        if close:
            m = s['marks'][c['id']]
            d.text((x, 82), f"紅點＝S14 δ 最大　右 {m['r']['d']} cm（δ>2cm {m['r']['off']} 點）", font=small, fill=(255, 120, 120))
            d.text((x, 112), f"　　　　　　　　左 {m['l']['d']} cm（δ>2cm {m['l']['off']} 點）", font=small, fill=(255, 120, 120))
        out.paste(ims[k], (k * (W + 12), head))
    out.save(os.path.join(root, f"{s['name']}.png"))
    print(s['name'])

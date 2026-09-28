# 把 raw/before-*.png 與 raw/after-*.png 並排（左＝現況 8720597、右＝最終版），加標題；輸出到上層資料夾
import glob, os
from PIL import Image, ImageDraw, ImageFont
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here); raw = os.path.join(root, 'raw')
font = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 30); small = ImageFont.truetype('C:/Windows/Fonts/msjh.ttc', 24)
def pair(name):
    a = Image.open(os.path.join(raw, f'before-{name}.png')).convert('RGB'); b = Image.open(os.path.join(raw, f'after-{name}.png')).convert('RGB')
    W, H = a.size; head = 90
    out = Image.new('RGB', (W * 2 + 12, H + head), (20, 24, 34)); d = ImageDraw.Draw(out)
    d.text((16, 10), name, font=font, fill=(240, 240, 240))
    d.text((16, 52), '左：現況 8720597', font=small, fill=(255, 200, 120)); d.text((W + 28, 52), '右：最終版', font=small, fill=(140, 220, 255))
    out.paste(a, (0, head)); out.paste(b, (W + 12, head))
    return out
names = sorted(os.path.basename(p)[len('before-'):-4] for p in glob.glob(os.path.join(raw, 'before-*.png')))
for n in names: pair(n).save(os.path.join(root, f'{n}.png'))
print('\n'.join(names))

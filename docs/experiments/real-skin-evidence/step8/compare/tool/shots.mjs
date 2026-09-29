// S10 對照（step7）時刻清單：[名稱, 幀, 鏡頭（null＝lib 該幀預設）]；近拍的鏡頭照抄 step5 1b，另加 K4b 腋下近拍
export const SHOTS = [
  ['1-扣球引臂-K1a', 'K1a', null],
  ['1b-扣球引臂-K1a-左臂胸口近拍', 'K1a', { az: 15, el: 8, dist: 1.25, ty: 1.4, tx: 0.1, tz: 0.02 }],
  ['2-揮臂擊球-K1b', 'K1b', null],
  ['3-發球起手-K2b', 'K2b', null],
  ['4-跑步擺臂-後擺-K3a', 'K3a', null],
  ['4b-跑步擺臂-前擺-K3b', 'K3b', null],
  ['5-待命接球-K4b', 'K4b', null],
  ['5b-待命接球-K4b-腋下近拍', 'K4b', { az: -20, el: 10, dist: 1.2, ty: 1.0, tx: -0.05, tz: 0.05 }],
];
export const CLOSEUPS = new Set(['1b-扣球引臂-K1a-左臂胸口近拍', '5b-待命接球-K4b-腋下近拍']);

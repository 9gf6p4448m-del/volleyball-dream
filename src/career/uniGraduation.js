// 大學畢業送別＋新生亮相的台詞（大二卷 批 4，2026-08-25）——★台詞單一事實源★
// careerScreen 只消費本檔；驗收＝`docs/kickoffs/acceptance-uni-y2-batch4.md`（B4-3）。
//
// 機制通用、內容錨點手寫：任何屆間畢業者都有送別（通用句）；該校 ace（帶 title）
// 用 title 版；`UNI_ALUMNI_ACES` 四位舊識在玩家隊畢業時用具名句——誰哪一年走
// 由各校年級表決定（universities.js），本檔不硬編年份。

// 具名句：照各自的高中→大學弧線寫（曜石「黑曜箭」/瀚崎國青「鐵彈道」/
// 青嵐→海硯「颱風眼」/黑松「未完成的牆」）。他們不一定在玩家隊——只有玩家
// 就讀該校時才會從這張表被念到。
// ★涵蓋率如實註記（批 4 覆審 MEDIUM）★：屆間推進只發生 3 次（大一→大四），
// 詹子曜（大二季末）與劉振鎧（大三季末）本卷可達；簡子嵐/曾家松與玩家同屆
// ＝大四季末畢業，要等**大學謝幕卷**接上大四收尾儀式才會被念到——這兩句是
// 預埋內容，不是本卷的活路徑，別誤判四句全上線。
const FAREWELL_BY_NAME = {
  詹子曜: '……你追上來了。那就別停在這裡——箭離弦之後，剩下的路自己飛。',
  劉振鎧: '國家隊那邊聯絡我了。彈道不會轉彎——場上見，那時候你最好夠格站在網子對面。',
  簡子嵐: '海硯之後，還有更大的海。……跟你同一隊的這幾年，浪打得很痛快。',
  曾家松: '三年沒封頂的牆，在這裡砌完了。……剩下的，換你們往上疊。',
};

/** 一位畢業者的送別句：具名舊識＞該校 ace（title 版）＞通用。 */
export function uniFarewellFor(member) {
  const byName = FAREWELL_BY_NAME[member?.name];
  if (byName) return byName;
  if (member?.title) {
    return `「${member.title}」的名字，留給下一個扛得動的人。……四年，夠本了。`;
  }
  return '四年打完了。這片場地，之後拜託你們了。';
}

/**
 * 畢業送別對話（dialogPlay 的 lines 格式）。graduates 空＝空陣列（呼叫端跳過）。
 * @param graduates uniSeasonTurnover 回傳的離隊成員
 */
export function uniGraduationLines(graduates = []) {
  if (!graduates.length) return [];
  const lines = [{
    speaker: '教練',
    text: '賽季結束了。……在解散之前，四年級的，留下來說幾句。',
  }];
  for (const g of graduates) {
    lines.push({ speaker: g.name, text: uniFarewellFor(g) });
  }
  lines.push({ speaker: '教練', text: '送學長到這裡。下個賽季——從明天開始練。' });
  return lines;
}

// 大學版新生亮相：高中版（events.js freshmenIntroLines）帶「遊隼的規矩」等校味，
// 不重用；大學新生全是決定論生成（uniTurnover），按位置給一句。
const UNI_FRESHMAN_GREETING = {
  setter: '學長們的球路我都看過錄影了。……舉球，交給我一次試試。',
  outside: '主攻缺的那一角，我來補。',
  middle: '攔網的時機，我還在學——但身高是現成的。',
  opposite: '右邊的位置，請多指教。',
  libero: '球不落地。就這一句。',
};

/** 大學新生亮相對話。freshmen 空＝空陣列。 */
export function uniFreshmenIntroLines(freshmen = []) {
  if (!freshmen.length) return [];
  const lines = [{ speaker: '教練', text: '補進來的新生，自我介紹。' }];
  for (const f of freshmen) {
    lines.push({
      speaker: f.name,
      text: UNI_FRESHMAN_GREETING[f.role] ?? '請多指教！',
    });
  }
  lines.push({ speaker: '教練', text: '位置是學長留下的——打不打得住，看你們自己。' });
  return lines;
}

// 大四末佔位過場卡（拍板題 1 乙：大學收尾儀式是下一卷，先立牌）。
// 形狀比照高中 careerFinale 的 NEXT_CHAPTER_LINES（title/sub/next 三段卡）。
export const UNI_FINALE_PLACEHOLDER = Object.freeze({
  title: '第二章・完',
  sub: '大學四年——名次、數據、畢業的背影，都收在生涯數據頁裡',
  next: '大學的謝幕儀式與下一個舞台　在下一卷',
});

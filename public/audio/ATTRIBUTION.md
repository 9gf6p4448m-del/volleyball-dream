# 音訊素材來源與授權（2026-08-28 大作感卷 批1＋2）

repo 內每個音檔的來源與授權。CC0 不強制標名，仍列出以便日後做 credits 頁。
（選材紀錄與轉檔參數的完整版在當日 session 的 manifest；此檔只列**實際進 repo** 的檔案。）

## sfx/（AAC mono 44.1kHz，全部進 PWA precache）

| 檔案 | 用途 | 來源 | 授權 |
|---|---|---|---|
| spike_hard.m4a | 重扣爆音 | kenney.nl「Impact Sounds」impactPunch_heavy_000 | CC0／Kenney |
| spike_mid.m4a | 發球/一般攻擊 | 同上 impactPunch_medium_000 | CC0／Kenney |
| spike_soft.m4a | 輕吊 | 同上 impactSoft_medium_001 | CC0／Kenney |
| receive.m4a | 墊球（與 spike_soft 同源，播放參數區分） | 同上 impactSoft_medium_001 | CC0／Kenney |
| set_touch.m4a | 舉球（同上） | 同上 impactSoft_medium_001 | CC0／Kenney |
| block.m4a | 攔網悶擊 | 同上 impactSoft_heavy_000 | CC0／Kenney |
| floor.m4a | 球落地（木地板） | 同上 impactWood_medium_000 | CC0／Kenney |
| net.m4a | 球觸網（**近似替代**：金屬彈振聲，非真網繩錄音，找到更貼切 CC0/CC-BY 素材建議替換） | opengameart.org/content/boings bing_02 | CC0／ezduzziteh (OpenGameArt) |
| whistle.m4a | 裁判哨（死球長哨） | opengameart.org/content/whistles whistle_1+whistle_3 剪接 | CC-BY 3.0／dklon (OpenGameArt) |
| crowd_loop.m4a | 體育館群眾底噪 loop | opengameart.org/content/crowd-shoutingspeaking-ambience | CC0／starninjas (OpenGameArt) |
| cheer.m4a | 得分歡呼 | opengameart.org/content/free-crowd-cheering-sounds「04 - Strong cheering - II - Short」節錄 | CC-BY 4.0／Gregor Quendel (OpenGameArt) |
| cheer_big.m4a | 關鍵分大聲浪 | 同上「01 - Strong cheering and strong rhythmic cheering」節錄 | CC-BY 4.0／Gregor Quendel (OpenGameArt) |
| squeak.m4a | 鞋底摩擦（急停/變向） | freesound.org/people/shakaharu/sounds/88502「sneaker skid squeak rubber」節錄 6.97–7.33s | CC0／shakaharu (Freesound) |

## bgm/（AAC stereo 128kbps，**不進** precache、串流載入；換檔即生效——替換同名檔即可）

2026-08-30 正式主題曲上線：全部換為 Sawmah 以 Google Flow Music（Lyria 模型）生成的原創曲，
取代先前的 Kevin MacLeod CC-BY 示範曲（該批已無檔案在 repo，標注義務隨之解除）。
每組生成了兩個候選，未採用的備選 WAV 在 Sawmah 的下載資料夾，換裝＝後製同流程蓋同名檔。

| 檔案 | 用途 | 生成曲名（首選） | 備選 | 來源 |
|---|---|---|---|---|
| bgm_menu_01.m4a | 主選單①（管弦熱血） | "Championship Serve" | "Point Break Fanfare" | Flow Music 生成（2026-08-30） |
| bgm_menu_02.m4a | 主選單②（管弦昂揚） | "Victory March" | "Championship Celebration" | 同上 |
| bgm_menu_03.m4a | 主選單③（電子動感） | "Electric Court" | "Cyber Spike" | 同上 |
| bgm_match_tension.m4a | 比賽緊張氛圍層（純打擊樂） | "Match Point Tension"（節錄 8-74s 做 60s 無縫循環） | "Heartbeat Pulse" | 同上 |

後製（可重現）：選單曲＝去頭部靜音＋30ms 淡入＋響度對齊 mean -14.6dB＋limiter 0.97；
比賽層＝acrossfade 6s 環接、對齊 mean -16.7dB。

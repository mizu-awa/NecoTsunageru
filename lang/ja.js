// 日本語テキスト定義
const LANG = {
  // ページメタ
  htmlLang: "ja",
  title: "ねこつなげる",

  // UI ラベル
  next: "NEXT",
  scoreHtml: "SCORE",
  timeLabel: "TIME",
  backBtn: "← 戻る",

  // タイトル画面
  tagline: "猫パーツをつなげて猫を完成させよう",
  startHint: "スペースキー / タップ でスタート",

  // タイトル画面: モード選択
  modeBtnEndless: "無限モード",
  modeBtnTimeAttack: "2分タイムアタック",

  // ゲームオーバー画面
  gameOverTitle: "ねこづまり",
  timeUpTitle: "タイムアップ！",
  scoreLabel: n => `スコア: ${n}`,
  catCount: n => `完成した猫: ${n}匹`,
  restartHint: "スペースキー / タップ でもう一度",

  // リザルト画面
  noCatsResult: "今回は猫が完成しませんでした",
  scorePt: n => `${n}点`,
  longestCat: n => `最長の猫: ${n}パーツ`,
  shareBtn: "共有する",
  downloadBtn: "画像をダウンロード",
  playAgainBtn: "もう一度遊ぶ",
  galleryBtn: "ギャラリーを見る",

  // ポップアップ演出
  simultaneous: n => `${n}匹いっぺん`,
  bonus: x => `×${x} ボーナス`,

  // ギャラリー画面
  galleryTitle: "ねこギャラリー",
  galleryCatCount: n => `${n}匹`,
  galleryEmpty: "まだ猫がいません",
  galleryEmptyHint: "猫を完成させると保存されます",
  galleryDetailHint: "外をタップで閉じる",

  // 操作説明
  controlsTitle: "操作方法",
  controlsPc: ["← → : 移動", "↑ / Space : 回転", "↓ : 加速"],
  controlsMobile: ["スワイプ : 移動", "タップ : 回転", "長押し : 加速"],
  controlsClose: "タップ・クリックで閉じる",

  // シェア
  shareImageTitle: "ねこつなげる",
  shareImageHashtag: dateStr => `${dateStr}  #ConnectingCats`,
  tweetText: (score, count) => `ねこつなげる で ${score}点！${count}匹の猫を完成させました！\n#ConnectingCats`,
};

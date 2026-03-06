// English text definitions
const LANG = {
  // Page meta
  htmlLang: "en",
  title: "Connecting Cats",

  // UI labels
  next: "NEXT",
  scoreHtml: "SCORE",
  timeLabel: "TIME",
  backBtn: "\u2190 Back",

  // Title screen
  tagline: "Connect cat parts to make cats!",
  startHint: "Space / Tap to Start",
  modeBtnEndless: "Endless",
  modeBtnTimeAttack: "2-Min Attack",

  // Game over screen
  gameOverTitle: "Cat Jam",
  timeUpTitle: "Time's Up!",
  scoreLabel: n => `Score: ${n}`,
  catCount: n => `Cats: ${n}`,
  restartHint: "Space / Tap to Play Again",

  // Result screen
  noCatsResult: "No cats were completed this time",
  scorePt: n => `${n} pts`,
  longestCat: n => `Longest: ${n} parts`,
  shareBtn: "Share",
  downloadBtn: "Download Image",
  playAgainBtn: "Play Again",
  galleryBtn: "View Gallery",

  // Popup effects
  simultaneous: n => `${n} at once!`,
  bonus: x => `\xD7${x} Bonus!`,

  // Gallery screen
  galleryTitle: "Cat Gallery",
  galleryCatCount: n => `${n}`,
  galleryEmpty: "No cats yet",
  galleryEmptyHint: "Complete cats to save them here",
  galleryDetailHint: "Tap outside to close",

  // Share
  shareImageTitle: "ConnectingCats",
  shareImageHashtag: dateStr => `${dateStr}  #ConnectingCats`,
  tweetText: (score, count) => `I scored ${score} pts and completed ${count} cats in NekoTsunageru!\n#NekoTsunageru`,
};

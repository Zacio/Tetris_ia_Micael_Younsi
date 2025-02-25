/****************************************************
 * CONFIG GLOBALE
 ****************************************************/
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 20;

/* Tetrominos standards */
const TETROMINOS = {
  I: [[1,1,1,1]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1]],
  S: [[0,1,1],[1,1,0]],
  Z: [[1,1,0],[0,1,1]],
  J: [[1,0,0],[1,1,1]],
  L: [[0,0,1],[1,1,1]]
};

/* Couleurs */
const COLORS = {
  I: 'cyan',
  O: 'yellow',
  T: 'purple',
  S: 'green',
  Z: 'red',
  J: 'blue',
  L: 'orange'
};

/* Intervalle de base + règles */
let BASE_DROP_INTERVAL = 800; 
const PAUSE_DOUCEUR_FACTOR = 0.8;   
const PAUSE_DOUCEUR_DURATION = 10000;
const RAINBOW_DURATION = 20000;
const RAINBOW_PERIOD = 120000;

/* Scores */
const SCORE_PER_LINE = 50;
const SCORE_BONUS_2 = 100;
const SCORE_BONUS_3 = 200;
const SCORE_BONUS_4 = 300;

/****************************************************
 * SONS EFFETS
 ****************************************************/
const landSound = new Audio("bgs/land.ogg");
const lineSound = new Audio("bgs/line.ogg");
const gameoverSound = new Audio("bgs/gameover.ogg");

/****************************************************
 * MUSIQUES GLOBALES (2 pistes)
 ****************************************************/
const music1 = new Audio("ost/music1.mp3"); // pour niveaux 1..3
const music2 = new Audio("ost/music2.mp3"); // pour niveau >=4
music1.loop = true;
music2.loop = true;
let music2Active = false; // Pour savoir si on a déjà switché vers music2

/****************************************************
 * CLASS PLAYER
 ****************************************************/
class Player {
  constructor(context, isAI = false) {
    this.context = context;
    this.isAI = isAI;

    this.isGameOver = false;
    this.resetBoard();

    // Score / Niveaux
    this.score = 0;
    this.level = 1;
    this.scoreForNextLevel = 2000; // passe un niveau tous les 2000 pts
    this.inventory = [];

    // Pièce courante
    this.nextEasyPiece = false;
    this.currentPiece = null;
    this.pos = { x: 0, y: 0 };

    // Timer
    this.lastDropTime = 0;

    // BONUS (un seul)
    this.bonuses = [];
    this.nextBonusThreshold = 500;
  }

  resetBoard() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  getCurrentDropInterval() {
    const factor = Math.min(this.level, 10);
    return BASE_DROP_INTERVAL / factor; 
  }

  getRandomPiece() {
    if (this.nextEasyPiece) {
      this.nextEasyPiece = false;
      const easy = ['I','O'];
      const k = easy[Math.floor(Math.random()*easy.length)];
      return { shape: TETROMINOS[k], type: k };
    }
    const keys = Object.keys(TETROMINOS);
    const rand = keys[Math.floor(Math.random()*keys.length)];
    return { shape: TETROMINOS[rand], type: rand };
  }

  spawnPiece() {
    this.currentPiece = this.getRandomPiece();
    this.pos.x = Math.floor(COLS/2) - Math.floor(this.currentPiece.shape[0].length/2);
    this.pos.y = 0;

    // Si déjà collision => Game Over
    if (this.collision(this.currentPiece.shape, this.pos)) {
      triggerPlayerGameOver(this, this.isAI ? "IA" : "Humain");
    }
  }

  rotatePiece() {
    return rotatePieceOnce(this.currentPiece.shape);
  }

  collision(shape, offset) {
    for (let y=0; y<shape.length; y++){
      for (let x=0; x<shape[y].length; x++){
        if (shape[y][x]) {
          const nx = offset.x + x;
          const ny = offset.y + y;
          if (nx<0 || nx>=COLS || ny>=ROWS) return true;
          if (ny>=0 && this.board[ny][nx]) return true;
        }
      }
    }
    return false;
  }

  mergePiece(shape, offset) {
    for (let y=0; y<shape.length; y++){
      for (let x=0; x<shape[y].length; x++){
        if (shape[y][x]) {
          this.board[offset.y + y][offset.x + x] = this.currentPiece.type;
        }
      }
    }
  }

  clearLines() {
    let lines=0;
    for (let y=ROWS-1; y>=0; y--){
      if (this.board[y].every(c=>c!==0)) {
        this.board.splice(y,1);
        this.board.unshift(Array(COLS).fill(0));
        lines++;
        y++;
      }
    }
    return lines;
  }

  update(deltaTime) {
    if (this.isGameOver) return;

    this.lastDropTime += deltaTime;
    const currentDrop = this.getCurrentDropInterval();

    if (!this.currentPiece) {
      this.spawnPiece();
      return;
    }
    if (this.lastDropTime > currentDrop) {
      this.pos.y++;
      if (this.collision(this.currentPiece.shape, this.pos)) {
        // atterrissage
        landSound.play();
        this.pos.y--;
        this.mergePiece(this.currentPiece.shape, this.pos);

        const linesCleared = this.clearLines();
        if (linesCleared>0){
          lineSound.play();
          if(linesCleared===1){
            this.score+=(SCORE_PER_LINE*this.level);
          } else if(linesCleared===2){
            this.score+=((SCORE_PER_LINE*2)*this.level)+SCORE_BONUS_2;
          } else if(linesCleared===3){
            this.score+=((SCORE_PER_LINE*3)*this.level)+SCORE_BONUS_3;
          } else if(linesCleared===4){
            this.score+=((SCORE_PER_LINE*4)*this.level)+SCORE_BONUS_4;
          }
        }
        this.handleSpecialRules(linesCleared);
        this.spawnPiece();
      }
      this.lastDropTime=0;
    }
  }

  handleSpecialRules(linesCleared) {
    if(linesCleared===2) {
      this._giveEasyPieceToOpponent=true;
    }
    if(linesCleared===4) {
      this._wantLineSwap=true;
    }
    this.checkLevelUp();
    if(Math.floor(this.score/1000) > Math.floor((this.score-(linesCleared*50))/1000)){
      this._triggerPauseDouceur=true;
    }
    this.checkForNewBonus();
  }

  checkLevelUp() {
    while(this.score >= this.scoreForNextLevel && this.level<10){
      this.level++;
      console.log(`Le joueur ${this.isAI?'IA':'Humain'} passe au niveau ${this.level}`);
      this.handleLevelReward(this.level);
      this.scoreForNextLevel+=2000;
    }
  }

  handleLevelReward(lvl){
    const item = getItemForLevel(lvl);
    if(item){
      console.log(`Le joueur ${this.isAI?'IA':'Humain'} gagne : ${item}`);
      this.inventory.push(item);
    }
  }

  checkForNewBonus(){
    while(this.score>=this.nextBonusThreshold){
      if(this.bonuses.length===0){
        if(Math.random()<0.5){
          const b=this.getRandomBonus();
          this.bonuses.push(b);
          console.log(`BONUS pour ${this.isAI?'IA':'Humain'} : ${b}`);
        }
      }
      this.nextBonusThreshold+=500;
    }
  }

  getRandomBonus(){
    const bonusList=['CLEAR_LINE','SLOW_TIME','SWITCH_PIECE'];
    return bonusList[Math.floor(Math.random()*bonusList.length)];
  }

  activateBonus(){
    if(this.isGameOver)return;
    if(!this.bonuses.length){
      console.log("Aucun bonus à activer.");
      return;
    }
    const b=this.bonuses.shift();
    console.log(`Bonus activé : ${b}`);
    switch(b){
      case 'CLEAR_LINE':
        this.clearOneLine();
        break;
      case 'SLOW_TIME':
        triggerPauseDouceur();
        break;
      case 'SWITCH_PIECE':
        if(this.currentPiece){
          this.currentPiece={shape:TETROMINOS['O'],type:'O'};
        }
        break;
      default:
        console.log('Bonus inconnu',b);
    }
  }

  clearOneLine(){
    for(let y=ROWS-1;y>=0;y--){
      if(!this.board[y].every(c=>c===0)){
        this.board.splice(y,1);
        this.board.unshift(Array(COLS).fill(0));
        console.log("CLEAR_LINE : une ligne effacée!");
        return;
      }
    }
  }

  draw(){
    if(this.isGameOver)return;
    this.context.clearRect(0,0,COLS*BLOCK_SIZE,ROWS*BLOCK_SIZE);

    for(let y=0;y<ROWS;y++){
      for(let x=0;x<COLS;x++){
        const type=this.board[y][x];
        if(type){
          this.drawBlock(x,y,COLORS[type]);
        }
      }
    }
    if(this.currentPiece){
      const shape=this.currentPiece.shape;
      for(let y=0;y<shape.length;y++){
        for(let x=0;x<shape[y].length;x++){
          if(shape[y][x]){
            this.drawBlock(this.pos.x+x,this.pos.y+y,COLORS[this.currentPiece.type]);
          }
        }
      }
    }
  }

  drawBlock(x,y,color){
    this.context.fillStyle=color;
    this.context.fillRect(x*BLOCK_SIZE,y*BLOCK_SIZE,BLOCK_SIZE,BLOCK_SIZE);
    this.context.strokeStyle='#333';
    this.context.strokeRect(x*BLOCK_SIZE,y*BLOCK_SIZE,BLOCK_SIZE,BLOCK_SIZE);
  }
}

/****************************************************
 * GESTION DES OBJETS PAR NIVEAU
 ****************************************************/
function getItemForLevel(level){
  switch(level){
    case 2: return 'Casque en bronze';
    case 3: return 'Gants en fer';
    case 4: return 'Bottes magiques';
    case 5: return 'Cape légendaire';
    case 6: return 'Épée en diamant';
    case 7: return 'Bouclier doré';
    case 8: return 'Amulette de feu';
    case 9: return 'Anneau de la lune';
    case 10:return 'Couronne sacrée';
    default:return null;
  }
}

/****************************************************
 * JOUEURS & AUTRES VARS
 ****************************************************/
let canvasHuman, canvasAI;
let ctxHuman, ctxAI;
let playerHuman, playerAI;
let lastTime=0;

/* Arc-en-ciel */
let rainbowMode=false;
let rainbowStart=0;

/****************************************************
 * FONCTIONS MUSIQUE
 ****************************************************/
function playMusic1(){
  music1.currentTime=0;
  music1.play().catch(err=>{
    console.log("Music1 autoplay blocked:",err);
  });
}

function stopMusic1(){
  music1.pause();
}

function playMusic2(){
  music2.currentTime=0;
  music2.play().catch(err=>{
    console.log("Music2 autoplay blocked:",err);
  });
}

function stopMusic2(){
  music2.pause();
}

/**
 * Vérifie si un des joueurs est >=4 => switch sur music2
 */
function updateMusicGlobal(){
  if(!music2Active && (playerHuman.level>=4 || playerAI.level>=4)){
    music2Active=true;
    stopMusic1();
    playMusic2();
  }
}

/****************************************************
 * INIT : APPELÉ SEULEMENT APRÈS LE CLIC SUR "JOUER"
 ****************************************************/
function init(){
  // Récupérer les canvas
  canvasHuman=document.getElementById('canvas-human');
  canvasAI=document.getElementById('canvas-ai');
  ctxHuman=canvasHuman.getContext('2d');
  ctxAI=canvasAI.getContext('2d');

  // Créer les players
  playerHuman=new Player(ctxHuman,false);
  playerAI=new Player(ctxAI,true);

  // Arc-en-ciel périodique
  setInterval(()=>{ startRainbowMode(); }, RAINBOW_PERIOD);

  // IA : bonus auto aléatoire
  setInterval(()=>{
    if(!playerAI.isGameOver && playerAI.bonuses.length>0){
      if(Math.random()<0.3){
        playerAI.activateBonus();
      }
    }
  },5000);

  // Boutons "Rejouer"
  document.getElementById('reload-button-human').addEventListener('click',()=>{
    location.reload();
  });
  document.getElementById('reload-button-ai').addEventListener('click',()=>{
    location.reload();
  });

  requestAnimationFrame(updateGame);
}

/****************************************************
 * GAME OVER
 ****************************************************/
function triggerPlayerGameOver(player, loserName){
  player.isGameOver=true;
  // On joue le son "gameover" pour ce joueur
  gameoverSound.play();

  if(loserName==='Humain'){
    document.getElementById('game-over-message-human').textContent=
      "GAME OVER ! Le joueur Humain a perdu.";
    document.getElementById('game-over-screen-human').style.display='flex';
  } else {
    document.getElementById('game-over-message-ai').textContent=
      "GAME OVER ! Le joueur IA a perdu.";
    document.getElementById('game-over-screen-ai').style.display='flex';
  }
}

/****************************************************
 * BOUCLE DE JEU
 ****************************************************/
function updateGame(timestamp){
  const deltaTime=timestamp-lastTime;
  lastTime=timestamp;

  if(!playerHuman.isGameOver){
    playerHuman.update(deltaTime);
  }
  if(!playerAI.isGameOver){
    playerAI.update(deltaTime);
    handleAI(playerAI);
  }

  handleCrossPlayerRules();

  playerHuman.draw();
  playerAI.draw();

  // Score + bonus
  document.getElementById('score-human').textContent=playerHuman.score;
  document.getElementById('level-human').textContent=playerHuman.level;
  document.getElementById('bonus-human').textContent=(playerHuman.bonuses.length
    ? playerHuman.bonuses.join(', ')
    : 'Aucun');

  document.getElementById('score-ai').textContent=playerAI.score;
  document.getElementById('level-ai').textContent=playerAI.level;
  document.getElementById('bonus-ai').textContent=(playerAI.bonuses.length
    ? playerAI.bonuses.join(', ')
    : 'Aucun');

  // Musique: switch sur music2 si needed
  updateMusicGlobal();

  // Arc-en-ciel
  if(rainbowMode){
    if(performance.now()-rainbowStart>RAINBOW_DURATION){
      rainbowMode=false;
      document.body.classList.remove('rainbow');
    }
  }

  requestAnimationFrame(updateGame);
}

/****************************************************
 * CONTROLES CLAVIER (HUMAIN)
 ****************************************************/
document.addEventListener('keydown',(e)=>{
  // si pas init ou si gameOver => skip
  if(!playerHuman||playerHuman.isGameOver||!playerHuman.currentPiece)return;
  switch(e.code){
    case 'ArrowLeft':
      playerHuman.pos.x--;
      if(playerHuman.collision(playerHuman.currentPiece.shape,playerHuman.pos)){
        playerHuman.pos.x++;
      }
      break;
    case 'ArrowRight':
      playerHuman.pos.x++;
      if(playerHuman.collision(playerHuman.currentPiece.shape,playerHuman.pos)){
        playerHuman.pos.x--;
      }
      break;
    case 'ArrowDown':
      playerHuman.pos.y++;
      if(playerHuman.collision(playerHuman.currentPiece.shape,playerHuman.pos)){
        playerHuman.pos.y--;
      }
      break;
    case 'ArrowUp':
      const oldShape=playerHuman.currentPiece.shape;
      playerHuman.currentPiece.shape=playerHuman.rotatePiece();
      if(playerHuman.collision(playerHuman.currentPiece.shape,playerHuman.pos)){
        playerHuman.currentPiece.shape=oldShape;
      }
      break;
    case 'KeyB':
      playerHuman.activateBonus();
      break;
  }
});

/****************************************************
 * IA
 ****************************************************/
function handleAI(ai){
  if(!ai||ai.isGameOver||!ai.currentPiece)return;

  let bestScore=-Infinity;
  let bestX=ai.pos.x;
  let bestRotation=0;
  let foundAnyPlacement=false;

  const originalShape=ai.currentPiece.shape;
  for(let r=0;r<4;r++){
    const rotated=rotatePieceNTimes(originalShape,r);
    for(let x=-2;x<COLS+2;x++){
      let yPos=0;
      while(yPos<ROWS&&!collisionTest(ai.board,rotated,{x,y:yPos})){
        yPos++;
      }
      yPos--;
      if(yPos<0)continue;
      if(collisionTest(ai.board,rotated,{x,y:yPos}))continue;

      foundAnyPlacement=true;
      const sc=evaluateBoard(ai.board,rotated,{x,y:yPos});
      if(sc>bestScore){
        bestScore=sc;
        bestX=x;
        bestRotation=r;
      }
    }
  }
  if(!foundAnyPlacement){
    triggerPlayerGameOver(ai,"IA");
    return;
  }

  const currentRot=detectRotation(ai.currentPiece.shape,originalShape);
  if(currentRot!==bestRotation){
    const old=ai.currentPiece.shape;
    ai.currentPiece.shape=rotatePieceOnce(ai.currentPiece.shape);
    if(ai.collision(ai.currentPiece.shape,ai.pos)){
      ai.currentPiece.shape=old;
    }
    return;
  }
  if(bestX<ai.pos.x){
    ai.pos.x--;
    if(ai.collision(ai.currentPiece.shape,ai.pos)){
      ai.pos.x++;
    }
  } else if(bestX>ai.pos.x){
    ai.pos.x++;
    if(ai.collision(ai.currentPiece.shape,ai.pos)){
      ai.pos.x--;
    }
  } else {
    ai.pos.y++;
    if(ai.collision(ai.currentPiece.shape,ai.pos)){
      ai.pos.y--;
    }
  }
}

/****************************************************
 * UTILS IA
 ****************************************************/
function rotatePieceNTimes(matrix,n){
  let res=matrix;
  for(let i=0;i<n;i++){
    res=rotatePieceOnce(res);
  }
  return res;
}

function evaluateBoard(board,shape,pos){
  const temp=board.map(row=>[...row]);
  for(let y=0;y<shape.length;y++){
    for(let x=0;x<shape[y].length;x++){
      if(shape[y][x]){
        const nx=pos.x+x;
        const ny=pos.y+y;
        if(nx>=0&&nx<COLS&&ny>=0&&ny<ROWS){
          temp[ny][nx]=1;
        }
      }
    }
  }
  let lines=0;
  for(let y=0;y<ROWS;y++){
    if(temp[y].every(c=>c!==0))lines++;
  }
  let maxH=getMaxHeight(temp);
  let holes=countHoles(temp);
  let bump=getBumpiness(temp);

  return (lines*10)-(maxH*0.5)-(holes*1.5)-(bump*0.5);
}

function getMaxHeight(tb){
  for(let y=0;y<ROWS;y++){
    for(let x=0;x<COLS;x++){
      if(tb[y][x]!==0){
        return (ROWS-y);
      }
    }
  }
  return 0;
}

function countHoles(tb){
  let holes=0;
  for(let x=0;x<COLS;x++){
    let blockFound=false;
    for(let y=0;y<ROWS;y++){
      if(tb[y][x])blockFound=true;
      else if(blockFound&&!tb[y][x])holes++;
    }
  }
  return holes;
}

function getBumpiness(tb){
  const heights=new Array(COLS).fill(0);
  for(let x=0;x<COLS;x++){
    for(let y=0;y<ROWS;y++){
      if(tb[y][x]!==0){
        heights[x]=(ROWS-y);
        break;
      }
    }
  }
  let sum=0;
  for(let i=0;i<COLS-1;i++){
    sum+=Math.abs(heights[i]-heights[i+1]);
  }
  return sum;
}

function rotatePieceOnce(m){
  return m[0].map((_,i)=>m.map(row=>row[i]).reverse());
}

function collisionTest(board,shape,offset){
  for(let y=0;y<shape.length;y++){
    for(let x=0;x<shape[y].length;x++){
      if(shape[y][x]){
        const nx=offset.x+x;
        const ny=offset.y+y;
        if(nx<0||nx>=COLS||ny>=ROWS)return true;
        if(ny>=0&&board[ny][nx])return true;
      }
    }
  }
  return false;
}

function detectRotation(curShape,origShape){
  for(let r=0;r<4;r++){
    const test=rotatePieceNTimes(origShape,r);
    if(areMatricesEqual(test,curShape))return r;
  }
  return 0;
}

function areMatricesEqual(a,b){
  if(a.length!==b.length)return false;
  for(let y=0;y<a.length;y++){
    if(a[y].length!==b[y].length)return false;
    for(let x=0;x<a[y].length;x++){
      if(a[y][x]!==b[y][x])return false;
    }
  }
  return true;
}

/****************************************************
 * RÈGLES CROSS-JOUEURS
 ****************************************************/
function handleCrossPlayerRules(){
  if(playerHuman._giveEasyPieceToOpponent){
    playerHuman._giveEasyPieceToOpponent=false;
    if(!playerAI.isGameOver){
      playerAI.nextEasyPiece=true;
    }
  }
  if(playerAI._giveEasyPieceToOpponent){
    playerAI._giveEasyPieceToOpponent=false;
    if(!playerHuman.isGameOver){
      playerHuman.nextEasyPiece=true;
    }
  }

  if(playerHuman._wantLineSwap){
    playerHuman._wantLineSwap=false;
    if(!playerAI.isGameOver){
      swapLines(playerHuman,playerAI);
    }
  }
  if(playerAI._wantLineSwap){
    playerAI._wantLineSwap=false;
    if(!playerHuman.isGameOver){
      swapLines(playerAI,playerHuman);
    }
  }

  if(playerHuman._triggerPauseDouceur){
    playerHuman._triggerPauseDouceur=false;
    triggerPauseDouceur();
  }
  if(playerAI._triggerPauseDouceur){
    playerAI._triggerPauseDouceur=false;
    triggerPauseDouceur();
  }
}

function swapLines(pA,pB){
  let fullLineIndex=-1;
  for(let y=ROWS-1;y>=0;y--){
    if(pA.board[y].every(c=>c!==0)){
      fullLineIndex=y;
      break;
    }
  }
  let emptyLineIndex=-1;
  for(let y=ROWS-1;y>=0;y--){
    if(pB.board[y].every(c=>c===0)){
      emptyLineIndex=y;
      break;
    }
  }
  if(fullLineIndex>=0&&emptyLineIndex>=0){
    const temp=pA.board[fullLineIndex];
    pA.board[fullLineIndex]=pB.board[emptyLineIndex];
    pB.board[emptyLineIndex]=temp;
  }
}

/****************************************************
 * PAUSE DOUCEUR & ARC-EN-CIEL
 ****************************************************/
function triggerPauseDouceur(){
  const oldBase=BASE_DROP_INTERVAL;
  BASE_DROP_INTERVAL=BASE_DROP_INTERVAL*(1/PAUSE_DOUCEUR_FACTOR);
  setTimeout(()=>{
    BASE_DROP_INTERVAL=oldBase;
  },PAUSE_DOUCEUR_DURATION);
}

function startRainbowMode(){
  rainbowMode=true;
  rainbowStart=performance.now();
  document.body.classList.add('rainbow');
}

/****************************************************
 * ECOUTE DU BOUTON "JOUER"
 ****************************************************/
// On n'appelle PAS init() tant que l'utilisateur n'a pas cliqué
const startButton = document.getElementById('start-button');
startButton.addEventListener('click', () => {
  // On cache le bouton
  startButton.style.display = 'none';

  // On lance la partie
  init();

  // On lance la musique 1
  playMusic1();
});

if (window.Telegram && window.Telegram.GameProxy) {
    window.Telegram.GameProxy.init();
}

const LEVEL_DURATION = 30;
const OBSTACLE_SPEED = 250;
const COLLECTIBLE_BASE_SPEED = 100;
const COLLECTIBLE_SPEED_VARIANCE = 33;
const COLLECTIBLE_MESSAGE = "с днём рождения";
const COLLECTED_FONT_SIZE = 28;
const COLLECTED_LETTER_SIZE = 40;
const COLLECTED_LINE_HEIGHT = 38;
const OBSTACLE_BASE_INTERVAL = 5;
const OBSTACLE_INTERVAL_VARIANCE = 1.5;
const COLLECTIBLE_MIN_HEIGHT = 90;
const COLLECTIBLE_MAX_HEIGHT = 250;
const COLLECTIBLE_SPAWN_INTERVAL = 2.0;
const HIT_TINT_COLOR = 0x8B0000;
const HIT_DURATION = 250;
const HIT_VIBRATION_AMPLITUDE = 2;
const LINE_SPACING = 10;
const BTN_RESTART_TEXT = "Играть сначала";
const BTN_SCHEDULE_TEXT = "Запланировать поболтать";
const BTN_SCHEDULE_URL = "https://calendly.com/vladimir-smir/chat";
const MISSED_LETTER_COLOR = 0xffffff;
const INITIAL_LIVES = 5;
const GAME_OVER_TEXT = "game over";
const GAME_OVER_COLOR = 0xFF0000;
const SCORE_PER_LETTER = 100;
const SCORE_PER_CACTUS_AVOIDED = 100;
const SCORE_PER_HIT = -200;
const UI_FONT_SIZE = 30;

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#000000',
    render: {
        pixelArt: true,
        antialias: false
    },
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 1200 }, debug: false }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);
let player;
let groundY;
let isHolding = false;
let targetScaleY = 1.0;
let currentScaleY = 1.0;
let isOnGround = false;
let skipGroundCheck = false;
let obstacles = [];
let collectibles = [];
let nextCollectibleCharIndex = 0;
let nextCollectibleCharId = 0;
let letterTargets = [];
let lastObstacleTime = 0;
let lastCollectibleTime = 0;
let gameTime = 0;
let gameOver = false;
let isRecovering = false;
let recoverStartTime = 0;
let groundTile;
let endScreenButtons = [];
let messageBottomY = 0;
let sceneRestarted = false;
let lives = INITIAL_LIVES;
let score = 0;
let isFirstPlay = true;
let livesText;
let scoreText;
let gameOverText;
let cactiAvoided = 0;
let cactiSpawned = 0;
let settledLetters = [];

function preload() {
    this.load.image('cactus', 'cactus.png');
    this.load.image('bg', 'bg.png');
    this.load.image('ground', 'ground.png');
}

function calculateLetterPositions() {
    const cellSize = COLLECTED_LETTER_SIZE;
    const maxWidth = config.width - cellSize;
    const charsPerLine = Math.floor(maxWidth / cellSize);
    const lineSpacing = LINE_SPACING;
    
    const words = COLLECTIBLE_MESSAGE.split(' ');
    const lines = [];
    let currentLine = [];
    let currentCharCount = 0;
    let charIndex = 0;

    for (let w = 0; w < words.length; w++) {
        const word = words[w];
        const wordLen = word.length;
        
        if (currentCharCount + (currentCharCount > 0 ? 1 : 0) + wordLen > charsPerLine) {
            lines.push(currentLine);
            currentLine = [];
            currentCharCount = 0;
        }
        
        if (currentLine.length > 0) {
            currentLine.push({ char: ' ', index: -1, width: cellSize, isSpace: true });
            currentCharCount++;
        }
        
        for (let c = 0; c < wordLen; c++) {
            currentLine.push({ char: word[c], index: charIndex, width: cellSize, isSpace: false });
            currentCharCount++;
            charIndex++;
        }
    }
    if (currentLine.length > 0) lines.push(currentLine);
    
    const targets = [];
    const totalHeight = lines.length * (COLLECTED_LINE_HEIGHT + lineSpacing);
    let startY = Math.max(20, (config.height * 0.25 - totalHeight) / 2 + cellSize / 2);
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineWidth = line.length * cellSize;
        let x = (config.width - lineWidth) / 2;
        const y = startY + i * (COLLECTED_LINE_HEIGHT + lineSpacing);
        
        for (let c of line) {
            if (!c.isSpace) {
                targets[c.index] = { x: x + cellSize / 2, y: y };
            }
            x += cellSize;
        }
    }
    return { targets, bottomY: startY + (lines.length - 1) * (COLLECTED_LINE_HEIGHT + lineSpacing) + cellSize / 2 };
}

function createPixelTextTexture(scene, text, fontSize, color, fontStyle) {
    const scale = 2;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontStyle} ${fontSize}px Arial, Helvetica, sans-serif`;
    const metrics = ctx.measureText(text);
    const width = Math.ceil(metrics.width) + 20;
    const height = Math.ceil(fontSize * 1.2) + 20;

    canvas.width = Math.ceil(width / scale);
    canvas.height = Math.ceil(height / scale);
    ctx.scale(1 / scale, 1 / scale);

    ctx.font = `${fontStyle} ${fontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.fillText(text, 10, 10);

    const texture = scene.textures.createCanvas('pixelText', canvas.width, canvas.height);
    const src = texture.getSourceImage();
    src.getContext('2d').drawImage(canvas, 0, 0);
    texture.refresh();
    return 'pixelText';
}

function settleLetter(scene, sprite, idx, collected) {
    const target = letterTargets[idx];
    if (!target) {
        sprite.destroy();
        return;
    }
    
    sprite.body.setAllowGravity(false);
    sprite.body.setVelocity(0);
    
    if (collected) {
        scene.tweens.add({
            targets: sprite,
            x: target.x,
            y: target.y,
            duration: 600,
            ease: 'Power2'
        });
        settledLetters.push(sprite);
    } else {
        sprite.x = target.x;
        sprite.y = target.y;
        sprite.setTintFill(MISSED_LETTER_COLOR);
        sprite.setAlpha(0.5);
        settledLetters.push(sprite);
    }
}

function create() {
    gameTime = 0;
    gameOver = false;
    isRecovering = false;
    skipGroundCheck = false;
    currentScaleY = 1.0;
    targetScaleY = 1.0;
    isOnGround = true;
    lastObstacleTime = 0;
    lastCollectibleTime = 0;
    nextCollectibleCharIndex = 0;
    nextCollectibleCharId = 0;
    obstacles = [];
    collectibles = [];
    endScreenButtons = [];
    cactiAvoided = 0;
    cactiSpawned = 0;

    if (!isFirstPlay) {
        lives = INITIAL_LIVES;
        score = 0;
    }

    groundY = config.height * 0.75;
    const letterPositions = calculateLetterPositions();
    letterTargets = letterPositions.targets;
    messageBottomY = letterPositions.bottomY;

    const bg = this.add.tileSprite(config.width / 2, config.height / 2, config.width, config.height, 'bg');
    bg.setScrollFactor(0);
    bg.tileScaleX = 0.25;
    bg.tileScaleY = 0.25;

    groundTile = this.add.tileSprite(config.width / 2, groundY + (config.height - groundY) / 2, config.width, config.height - groundY, 'ground');
    groundTile.setScrollFactor(0);

    const textureKey = createPixelTextTexture(this, 'Ы', 72, '#FFE135', 'bold italic');

    player = this.add.sprite(config.width / 2, groundY - 100, textureKey).setOrigin(0.5, 1);
    player.setDepth(1);
    player.setScale(2);
    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);
    player.body.setBounce(0);

    this.input.on('pointerdown', () => {
        if (gameOver) return;
        isHolding = true;
        targetScaleY = 0.5;
    });
    this.input.on('pointerup', () => {
        if (gameOver) return;
        isHolding = false;
        targetScaleY = 1.0;
        if (isOnGround) {
            const compression = 1.0 - currentScaleY;
            if (compression > 0.01) {
                player.body.setVelocityY(-compression * 1300);
                skipGroundCheck = true;
                isOnGround = false;
            }
        }
    });

    if (window.Telegram && window.Telegram.GameProxy) {
        Telegram.GameProxy.ready();
    }

    if (!isFirstPlay) {
        livesText = this.add.text(20, groundY + (config.height - groundY) / 2, `❤️ x ${lives}`, {
            fontSize: `${UI_FONT_SIZE}px`,
            fontFamily: 'Arial, Helvetica, sans-serif',
            fill: '#FFFFFF'
        }).setOrigin(0, 0.5).setDepth(5);

        scoreText = this.add.text(config.width - 20, groundY + (config.height - groundY) / 2, `👑 x ${score}`, {
            fontSize: `${UI_FONT_SIZE}px`,
            fontFamily: 'Arial, Helvetica, sans-serif',
            fill: '#FFFFFF'
        }).setOrigin(1, 0.5).setDepth(5);
    }

    settledLetters = [];

    this.events.on('shutdown', () => {
        for (let i = 0; i < COLLECTIBLE_MESSAGE.length; i++) {
            const key = 'collectible_' + i;
            if (this.textures.exists(key)) {
                this.textures.remove(key);
            }
        }
        if (this.textures.exists('pixelText')) {
            this.textures.remove('pixelText');
        }
    });
}

function showEndScreen(scene) {
    const btnWidth = 300;
    const btnHeight = 50;
    const playerTopY = groundY - 100;
    const btnY = (messageBottomY + playerTopY) / 2;
    
    const restartBtn = scene.add.text(config.width / 2, btnY - 40, BTN_RESTART_TEXT, {
        fontSize: '24px',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fill: '#FFFFFF',
        backgroundColor: '#4CAF50',
        padding: { x: 20, y: 10 }
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
    
    const scheduleBtn = scene.add.text(config.width / 2, btnY + 40, BTN_SCHEDULE_TEXT, {
        fontSize: '24px',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fill: '#FFFFFF',
        backgroundColor: '#2196F3',
        padding: { x: 20, y: 10 }
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
    
    restartBtn.setDepth(10).on('pointerdown', () => {
        console.log("Restart clicked");
        isFirstPlay = false;
        scene.scene.restart();
    });
    
    scheduleBtn.setDepth(10).on('pointerdown', () => {
        console.log("Schedule clicked");
        window.location.href = BTN_SCHEDULE_URL;
    });
    
    endScreenButtons = [restartBtn, scheduleBtn];
    sceneRestarted = true;
}

function restartGame(scene) {
    scene.tweens.killAll();
    
    for (const btn of endScreenButtons) {
        btn.destroy();
    }
    endScreenButtons = [];
    
    for (const obs of obstacles) {
        obs.destroy();
    }
    obstacles = [];
    
    for (const col of collectibles) {
        col.destroy();
    }
    collectibles = [];
    
    nextCollectibleCharIndex = 0;
    nextCollectibleCharId = 0;
    lastObstacleTime = 0;
    lastCollectibleTime = 0;
    gameTime = 0;
    gameOver = false;
    isRecovering = false;
    skipGroundCheck = false;
    currentScaleY = 1.0;
    targetScaleY = 1.0;
    isOnGround = true;
    
    player.y = groundY - 100;
    player.body.setEnable(true);
    player.body.setAllowGravity(true);
    player.body.setVelocityY(0);
    player.setScale(2, 2);
    player.clearTint();
    player.x = config.width / 2;
}

function spawnObstacle(scene) {
    const obs = scene.add.sprite(config.width + 32, groundY, 'cactus').setOrigin(0.5, 1);
    scene.physics.add.existing(obs);
    obs.body.setAllowGravity(false);
    obs.body.setVelocityX(-OBSTACLE_SPEED);
    obs.body.setSize(48, 94);
    obs.setData('avoided', true);
    obstacles.push(obs);
    cactiSpawned++;
}

function spawnCollectible(scene) {
    while (nextCollectibleCharIndex < COLLECTIBLE_MESSAGE.length && COLLECTIBLE_MESSAGE[nextCollectibleCharIndex] === ' ') {
        nextCollectibleCharIndex++;
    }
    if (nextCollectibleCharIndex >= COLLECTIBLE_MESSAGE.length) return;

    const letter = COLLECTIBLE_MESSAGE[nextCollectibleCharIndex];
    const idx = nextCollectibleCharId;
    nextCollectibleCharId++;
    nextCollectibleCharIndex++;
    
    const size = COLLECTED_LETTER_SIZE;
    const speed = COLLECTIBLE_BASE_SPEED + (Math.random() * 2 - 1) * COLLECTIBLE_SPEED_VARIANCE;

    const colors = ['#FF0000', '#008000', '#00FFFF', '#FF00FF', '#EE82EE','#FFA500'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = 2;
    canvas.width = Math.ceil(size / scale);
    canvas.height = Math.ceil(size / scale);
    ctx.scale(1 / scale, 1 / scale);
    ctx.font = `bold ${size}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, size / 2, size / 2);

    const textureKey = 'collectible_' + idx;
    if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
    }
    const texture = scene.textures.createCanvas(textureKey, canvas.width, canvas.height);
    texture.getSourceImage().getContext('2d').drawImage(canvas, 0, 0);
    texture.refresh();

    const randomY = Phaser.Math.Between(groundY - COLLECTIBLE_MAX_HEIGHT, groundY - COLLECTIBLE_MIN_HEIGHT);
    const col = scene.add.sprite(config.width + size, randomY, textureKey).setOrigin(0.5, 0.5);
    col.setScale(2);
    col.setData('charIndex', idx);
    scene.physics.add.existing(col);
    col.body.setAllowGravity(false);
    col.body.setVelocityX(-speed);
    col.body.setSize(size, size);
    collectibles.push(col);
}

function checkCollision(a, b) {
    const aBounds = a.getBounds();
    const bBounds = b.getBounds();
    return (
        aBounds.x < bBounds.right &&
        aBounds.right > bBounds.x &&
        aBounds.y < bBounds.bottom &&
        aBounds.bottom > bBounds.y
    );
}

function update(time, delta) {
    const deltaSec = delta / 1000;
    gameTime += deltaSec;

    if (gameTime >= LEVEL_DURATION && !gameOver) {
        gameOver = true;
        player.body.setAllowGravity(false);
        player.body.setVelocityY(50);
        for (let i = collectibles.length - 1; i >= 0; i--) {
            const col = collectibles[i];
            settleLetter(this, col, col.getData('charIndex'), false);
            collectibles.splice(i, 1);
        }
        
        if (!isFirstPlay) {
            for (const obs of obstacles) {
                if (obs.getData('avoided')) {
                    cactiAvoided++;
                    score += SCORE_PER_CACTUS_AVOIDED;
                }
            }
            if (scoreText) scoreText.setText(`👑 x ${score}`);
        }
        
        showEndScreen(this);
    }

    if (skipGroundCheck) {
        skipGroundCheck = false;
    } else if (player.y >= groundY) {
        player.y = groundY;
        player.body.setVelocityY(0);
        isOnGround = true;
        if (!isHolding && currentScaleY < 1.0) {
            targetScaleY = 1.0;
        }
    } else {
        isOnGround = false;
    }

    const scaleSpeed = 0.015;
    if (currentScaleY < targetScaleY) {
        currentScaleY = Math.min(currentScaleY + scaleSpeed, targetScaleY);
    } else if (currentScaleY > targetScaleY) {
        currentScaleY = Math.max(currentScaleY - scaleSpeed, targetScaleY);
    }
    player.setScale(2, 2 * currentScaleY);

    if (isRecovering) {
        const elapsed = time - recoverStartTime;
        const vibration = Math.sin(elapsed * 0.1) * HIT_VIBRATION_AMPLITUDE;
        player.x = config.width / 2 + vibration;
    }

    if (gameOver) {
        if (player.y >= groundY) {
            player.setScale(2, 2);
        }
        return;
    }

    if (skipGroundCheck) {
        skipGroundCheck = false;
    }

    groundTile.tilePositionX += OBSTACLE_SPEED * deltaSec;

    lastObstacleTime += deltaSec;
    const timeRemaining = LEVEL_DURATION - gameTime;
    const currentInterval = OBSTACLE_BASE_INTERVAL + (Math.random() * 2 - 1) * OBSTACLE_INTERVAL_VARIANCE;
    if (lastObstacleTime >= currentInterval && OBSTACLE_SPEED * timeRemaining > config.width * 2 / 3) {
        spawnObstacle(this);
        lastObstacleTime = 0;
    }

    lastCollectibleTime += deltaSec;
    if (lastCollectibleTime >= COLLECTIBLE_SPAWN_INTERVAL && COLLECTIBLE_BASE_SPEED * timeRemaining > config.width * 2 / 3) {
        spawnCollectible(this);
        lastCollectibleTime = 0;
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        if (obs.x < -50) {
            obs.destroy();
            obstacles.splice(i, 1);
            continue;
        }
        if (checkCollision(player, obs)) {
            if (obs.getData('hit')) continue;
            obs.setData('hit', true);
            obs.setData('avoided', false);
            if (!isFirstPlay) {
                lives--;
                score = Math.max(0, score + SCORE_PER_HIT);
                if (livesText) livesText.setText(`❤️ x ${lives}`);
                if (scoreText) scoreText.setText(`👑 x ${score}`);
                
                if (lives <= 0) {
                    triggerGameOver(this);
                    return;
                }
            }
            if (!isRecovering) {
                isRecovering = true;
                recoverStartTime = time;
                player.setTintFill(HIT_TINT_COLOR);
                this.time.delayedCall(HIT_DURATION, () => {
                    player.clearTint();
                    isRecovering = false;
                });
            }
        }
    }

    for (let i = collectibles.length - 1; i >= 0; i--) {
        const col = collectibles[i];
        if (col.x < -50) {
            settleLetter(this, col, col.getData('charIndex'), false);
            collectibles.splice(i, 1);
            continue;
        }
        if (checkCollision(player, col)) {
            if (!isFirstPlay) {
                score += SCORE_PER_LETTER;
                if (scoreText) scoreText.setText(`👑 x ${score}`);
            }
            settleLetter(this, col, col.getData('charIndex'), true);
            collectibles.splice(i, 1);
        }
    }
    
    if (!isFirstPlay) {
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            if (obs.x < -50 && obs.getData('avoided')) {
                cactiAvoided++;
                score += SCORE_PER_CACTUS_AVOIDED;
                if (scoreText) scoreText.setText(`👑 x ${score}`);
            }
        }
    }
}

function triggerGameOver(scene) {
    gameOver = true;
    player.body.setEnable(true);
    player.body.setAllowGravity(true);
    player.body.setVelocityY(200);
    
    showGameOverText(scene);
}

function showGameOverText(scene) {
    for (const letter of settledLetters) {
        letter.destroy();
    }
    settledLetters = [];

    const textureKey = 'gameOverText';
    if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
    }
    
    const size = COLLECTED_LETTER_SIZE;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = 2;
    //canvas.width = Math.ceil(size / scale);
    //canvas.height = Math.ceil(size / scale);
    canvas.width = Math.ceil(config.width / scale);
    canvas.height = Math.ceil(size * 2 / scale);
    ctx.scale(1 / scale, 1 / scale);
    ctx.font = `bold ${size}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(GAME_OVER_TEXT, config.width / 2, size);
    
    const texture = scene.textures.createCanvas(textureKey, canvas.width, canvas.height);
    texture.getSourceImage().getContext('2d').drawImage(canvas, 0, 0);
    texture.refresh();
    
    gameOverText = scene.add.sprite(config.width / 2, messageBottomY, textureKey).setOrigin(0.5, 0.5);
    gameOverText.setScale(2);
    gameOverText.setTintFill(GAME_OVER_COLOR);
    
    showEndScreen(scene);
}

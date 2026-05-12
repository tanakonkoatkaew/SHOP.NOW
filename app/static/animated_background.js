// static/animated_background.js
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

let particles = [];
let w, h;

function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

function createParticles() {
    particles = [];
    for (let i = 0; i < 150; i++) {
        particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            radius: Math.random() * 2 + 1,
            speedX: (Math.random() - 0.5) * 0.5,
            speedY: (Math.random() - 0.5) * 0.5,
            alpha: Math.random()
        });
    }
}

function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.closePath();
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 10);
        gradient.addColorStop(0, `rgba(255,255,255,${p.alpha})`);
        gradient.addColorStop(1, 'rgba(0,0,50,0)');
        ctx.fillStyle = gradient;
        ctx.fill();
    });
}

function update() {
    particles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < 0 || p.x > w) p.speedX *= -1;
        if (p.y < 0 || p.y > h) p.speedY *= -1;
    });
}

function loop() {
    draw();
    update();
    requestAnimationFrame(loop);
}

createParticles();
loop();

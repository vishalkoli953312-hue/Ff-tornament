import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, orderBy, where, addDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase Configurations
const firebaseConfig = {
  apiKey: "AIzaSyCt3W96wZhdnbX2NiWiMFERQVXeFIdxyp0",
  authDomain: "my-game-7da3b.firebaseapp.com",
  databaseURL: "https://my-game-7da3b-default-rtdb.firebaseio.com",
  projectId: "my-game-7da3b",
  storageBucket: "my-game-7da3b.firebasestorage.app",
  messagingSenderId: "628106631481",
  appId: "1:628106631481:web:338fe45a9939cdcb09b0e8",
  measurementId: "G-VJ6V9W5XX6"
};

const app = initializeApp(firebaseConfig); 
const auth = getAuth(app); 
const db = getFirestore(app); 
const root = document.documentElement;

let currentUserDoc = null; 
let globalUpdatesData = []; 
let isResettingPassword = false; 
let uiFetched = false; 
let uiFetchPromise = fetchUIControls();
let appProfileSettings = {};

let addMoneySettings = { min: 10, max: 10000, btnText: 'Proceed to Pay' };
let minWithdrawLimit = 50;
let globalTransactions = [];

// Lock flag to prevent double OTP requests
let isSendingOTP = false; 

// ==========================================
// COMPACT LIVE SERVER CLOCK LOGIC
// ==========================================
function updateLiveClock() {
    const now = new Date();
    let h = now.getHours(); let m = now.getMinutes(); let s = now.getSeconds();
    let ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; h = h ? h : 12; 
    
    let hh = h < 10 ? '0' + h : h;
    let mm = m < 10 ? '0' + m : m;
    let ss = s < 10 ? '0' + s : s;
    
    const clockEl = document.getElementById('mini-clock');
    if(clockEl) { clockEl.innerText = `${hh}:${mm}:${ss} ${ampm}`; }
}
setInterval(updateLiveClock, 500); 
updateLiveClock();

// ==========================================
// HISTORY / BACK BUTTON LOGIC
// ==========================================
let currentActiveTab = 'home';

window.goBack = function() {
    if(currentActiveTab === 'home') {
         if(confirm("Do you want to exit the app?")) { window.close(); }
    } else if (['wallet', 'my-matches', 'profile', 'top', 'refer'].includes(currentActiveTab)) {
         showHomePanel();
    } else {
         window.history.back();
    }
}

window.addEventListener('popstate', (e) => {
    if(document.getElementById('prize-modal').style.display === 'flex') {
        closePrizeModal();
        pushHistoryState(currentActiveTab);
        return;
    }
    if(document.getElementById('uid-modal').style.display === 'flex') { closeGlassModal('uid-modal'); pushHistoryState(currentActiveTab); return; }
    if(document.getElementById('password-modal').style.display === 'flex') { closeGlassModal('password-modal'); pushHistoryState(currentActiveTab); return; }

    if (e.state && e.state.id) {
        routeToState(e.state.id, true);
    } else {
        routeToState('home', true);
    }
});

function pushHistoryState(id) {
    if (id === currentActiveTab) return;
    
    if (currentActiveTab === 'home' && ['wallet', 'profile', 'top', 'refer', 'my-matches'].includes(id)) {
        window.history.pushState({id: id}, '', '');
    } 
    else if (currentActiveTab !== 'home' && ['wallet', 'profile', 'top', 'refer', 'my-matches'].includes(id)) {
        window.history.replaceState({id: id}, '', '');
    } 
    else {
        window.history.pushState({id: id}, '', '');
    }
    currentActiveTab = id;
}

function routeToState(id, isBack = false) {
    currentActiveTab = id;
    if(id === 'home') { showHomePanel(true); }
    else if(id === 'wallet') { showWallet(true); }
    else if(id === 'profile') { showProfile(true); }
    else if(id === 'top') { showTopWinners(true); }
    else if(id === 'refer') { showReferral(true); }
    else if(id === 'addmoney') { startRechargeFlow(true); }
    else if(id === 'withdraw') { openWithdrawalSection(true); }
    else if(id === 'updates') { showUpdatesList(true); }
    else if(id === 'notifications') { showNotifications(true); }
    else if(id === 'history') { showTransactionHistory(true); }
    else if(id === 'game-matches') { openGameMatches(null, true); }
    else if(id === 'my-matches') { openMyMatches('upcoming', true); }
    else { showHomePanel(true); }
}

// ==========================================
// PULL TO REFRESH LOGIC
// ==========================================
let pStartY = 0, pCurrentY = 0, isRefreshing = false;
const ptrWrapper = document.getElementById('ptr-wrapper');

document.querySelectorAll('.page-section').forEach(section => {
    let lastScrollTop = 0;
    section.addEventListener('scroll', function() {
        let st = this.scrollTop;
        const bottomNav = document.getElementById('bottom-nav');
        if (st > lastScrollTop && st > 30) {
            bottomNav.classList.add('hide-nav');
        } else {
            bottomNav.classList.remove('hide-nav');
        }
        lastScrollTop = st <= 0 ? 0 : st;
    }, { passive: true });

    section.addEventListener('touchstart', e => { 
        if(section.scrollTop <= 0 && !isRefreshing) pStartY = e.touches[0].clientY; 
    }, {passive: true});
    
    section.addEventListener('touchmove', e => {
        if(section.scrollTop <= 0 && pStartY > 0 && !isRefreshing) {
            pCurrentY = e.touches[0].clientY;
            let pull = pCurrentY - pStartY;
            if(pull > 0 && pull < 150) { ptrWrapper.style.transform = `translateY(${pull - 80}px)`; }
        }
    }, {passive: true});
    
    section.addEventListener('touchend', e => {
        if(section.scrollTop <= 0 && pStartY > 0 && !isRefreshing) {
            let pull = pCurrentY - pStartY;
            if(pull > 70) {
                isRefreshing = true;
                ptrWrapper.style.transform = `translateY(20px)`;
                ptrWrapper.classList.add('ptr-spin');
                refreshAppData(); 
            } else { ptrWrapper.style.transform = `translateY(-80px)`; }
        }
        pStartY = 0; pCurrentY = 0;
    }, {passive: true});
});

async function refreshAppData() {
    try {
        await fetchUIControls(); 
        if(auth.currentUser) { await loadRecentTransactions(auth.currentUser.uid); await fetchNotifications(auth.currentUser.uid); }
    } catch(e){}
    setTimeout(() => {
        isRefreshing = false; ptrWrapper.classList.remove('ptr-spin'); ptrWrapper.style.transform = `translateY(-80px)`;
    }, 100); 
}

// ==========================================
// REAL FIREBASE TOURNAMENT FETCH LOGIC
// ==========================================
let currentMatchGame = null;
let currentMatchTab = 'upcoming';
let currentMatchSubTab = 'ALL';
let allLiveMatches = [];

window.openGameMatches = function(gameName, isBack = false) {
    if(!isBack) pushHistoryState('game-matches');
    hideAllSections();
    if(gameName) {
        currentMatchGame = gameName;
        document.getElementById('gm-title').innerText = gameName;
    }
    document.getElementById('game-matches-section').style.display = 'block';
    
    document.querySelectorAll('#game-matches-section .m-tab').forEach(btn => {
        btn.onclick = function() {
            document.querySelectorAll('#game-matches-section .m-tab').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentMatchTab = this.getAttribute('data-tab');
            
            if(currentMatchTab === 'upcoming') {
                document.getElementById('gm-sub-tabs').style.display = 'flex';
            } else {
                document.getElementById('gm-sub-tabs').style.display = 'none';
            }
            
            renderLiveMatchCards();
        }
    });

    document.getElementById('gm-sub-tab-select').addEventListener('change', function(e) {
        currentMatchSubTab = e.target.value;
        renderLiveMatchCards();
    });

    document.querySelectorAll('#game-matches-section .m-tab').forEach(b => b.classList.remove('active'));
    document.querySelector('#game-matches-section .m-tab[data-tab="upcoming"]').classList.add('active');
    currentMatchTab = 'upcoming';
    currentMatchSubTab = 'ALL';
    document.getElementById('gm-sub-tab-select').value = 'ALL';
    document.getElementById('gm-sub-tabs').style.display = 'flex';

    resetAppScroll();
    fetchLiveMatches();
}

function fetchLiveMatches() {
    const matchesRef = query(collection(db, "tournaments"), orderBy("timestamp", "asc"));
    onSnapshot(matchesRef, (snapshot) => {
        allLiveMatches = [];
        snapshot.forEach(doc => {
            let d = doc.data();
            d.dbId = doc.id;
            allLiveMatches.push(d);
        });
        renderLiveMatchCards();
    });
}

function getProgressBarProps(joined, total) {
    const percent = (joined / total) * 100;
    let colorClass = 'prog-green';
    if (percent > 85) colorClass = 'prog-red';
    else if (percent > 50) colorClass = 'prog-yellow';
    return { width: percent + '%', class: colorClass, isFull: joined >= total };
}

window.openPrizeModal = function(name, type, details) {
    document.getElementById('pz-match-name').innerText = `${name} | ${type}`;
    document.getElementById('pz-details-txt').innerHTML = details.replace(/\n/g, '<br>');
    document.getElementById('prize-modal').style.display = 'flex';
}
window.closePrizeModal = function() { document.getElementById('prize-modal').style.display = 'none'; }

function renderLiveMatchCards() {
    const wrapper = document.getElementById('matches-wrapper');
    
    let filtered = allLiveMatches.filter(m => m.gameName === currentMatchGame && (m.status === currentMatchTab || (currentMatchTab === 'live' && m.status === 'ongoing')));
    
    if(currentMatchTab === 'upcoming' && currentMatchSubTab !== 'ALL') {
        filtered = filtered.filter(m => m.matchType.toUpperCase() === currentMatchSubTab);
    }

    if(filtered.length === 0) {
        let dispTab = currentMatchTab === 'live' ? 'LIVE' : currentMatchTab.toUpperCase();
        let dispSub = currentMatchTab === 'upcoming' && currentMatchSubTab !== 'ALL' ? ` for ${currentMatchSubTab}` : '';
        wrapper.innerHTML = `<div style="text-align:center; padding:40px 20px; color:#888;">No ${dispTab} matches found${dispSub}.</div>`;
        return;
    }

    let html = '';
    filtered.forEach(m => {
        const prog = getProgressBarProps(m.joinedSpots, m.totalSpots);
        const spotsLeft = m.totalSpots - m.joinedSpots;
        const entryHtml = m.entryFee == 0 ? `<span class="mc-stat-val free game-font">FREE</span>` : `<span class="mc-stat-val game-font flex-amt"><img src="https://i.ibb.co/HLK8R51v/Untitled13-20260512152418.png" class="coin-icon" style="width:18px; height:18px;"> ${m.entryFee}</span>`;
        
        let perKillHtml = '';
        if(m.matchCategory === 'Clash Squad') {
            perKillHtml = `<div class="mc-stat-val game-font" style="font-size:15px; color:#888;">N/A</div>`;
        } else {
            perKillHtml = `<div class="mc-stat-val game-font flex-amt"><img src="https://i.ibb.co/HLK8R51v/Untitled13-20260512152418.png" class="coin-icon" style="width:18px; height:18px;"> ${m.perKill || 0}</div>`;
        }

        let bannerHtml = '';
        let bottomRowHtml = '';
        
        let isUserJoined = Math.random() > 0.5; 
        let joinedStatusHtml = isUserJoined ? 
            `<div style="color:#4ade80; font-weight:bold; font-size:12px; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-circle-check"></i> Joined</div>` : 
            `<div style="color:#ef4444; font-weight:bold; font-size:12px; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-circle-xmark"></i> Not Joined</div>`;

        if(currentMatchTab === 'upcoming') {
            bannerHtml = `
            <div class="mc-banner-wrap">
                <img src="${m.bannerUrl}" class="mc-banner">
                <div class="mc-tags">
                    <span class="mc-tag"><i class="fa-solid fa-star"></i> ${m.matchType}</span>
                    <span class="mc-tag"><i class="fa-solid fa-location-dot"></i> ${m.map}</span>
                </div>
            </div>`;
            
            let btnHtml = prog.isFull ? `<button class="mc-btn-join mc-btn-full">MATCH FULL</button>` : `<button class="mc-btn-join" onclick="alert('Join logic in progress...')">JOIN NOW</button>`;
            
            bottomRowHtml = `
            <div class="mc-bottom-row">
                <div class="mc-progress-wrap">
                    <div class="mc-progress-bg"><div class="mc-progress-fill ${prog.class}" style="width: ${prog.width};"></div></div>
                    <div class="mc-spots-txt"><span>Only ${spotsLeft} spots left</span><span>${m.joinedSpots}/${m.totalSpots}</span></div>
                </div>
                ${btnHtml}
            </div>`;
        } 
        else if(currentMatchTab === 'live') {
            bottomRowHtml = `
            <div class="mc-bottom-row" style="margin-top:8px;">
                ${joinedStatusHtml}
                <button class="mc-btn-join" style="background:#ef4444;" onclick="alert('Live room streaming...')"><i class="fa-brands fa-youtube"></i> WATCH LIVE</button>
            </div>`;
        } 
        else { 
            bottomRowHtml = `
            <div class="mc-bottom-row" style="margin-top:8px;">
                ${joinedStatusHtml}
                <button class="mc-btn-join" style="background:#a855f7;" onclick="alert('Viewing results...')"><i class="fa-solid fa-video"></i> WATCH MATCH</button>
            </div>`;
        }

        html += `
        <div class="match-card tactile-3d">
            ${bannerHtml}
            <div class="mc-info-section">
                <div class="mc-title-row">
                    <div class="mc-logo-wrap"><img src="${m.logoUrl}"></div>
                    <div style="flex-grow:1;">
                        <div class="mc-title">${m.matchTitle} | ${m.matchId}</div>
                        <div class="mc-time-container">
                            <span class="mc-time">Time: ${m.timeString}</span>
                            <span class="mc-countdown" data-time="${m.timestamp}" data-id="${m.dbId}">Loading...</span>
                        </div>
                    </div>
                </div>
                
                <div class="mc-stats-grid">
                    <div class="mc-stat-box" onclick="openPrizeModal('${m.matchTitle}', '${m.matchType}', \`${m.prizeDetails}\`)">
                        <div class="mc-stat-lbl">PRIZE POOL <i class="fa-solid fa-angle-down"></i></div>
                        <div class="mc-stat-val game-font flex-amt"><img src="https://i.ibb.co/HLK8R51v/Untitled13-20260512152418.png" class="coin-icon" style="width:18px; height:18px;"> ${m.prizePool}</div>
                    </div>
                    <div class="mc-stat-box">
                        <div class="mc-stat-lbl">PER KILL</div>
                        ${perKillHtml}
                    </div>
                    <div class="mc-stat-box">
                        <div class="mc-stat-lbl">ENTRY FEE</div>
                        ${entryHtml}
                    </div>
                </div>

                <div class="mc-meta-grid" style="margin-bottom:8px;">
                    <div class="mc-meta-box"><div class="mc-meta-lbl">TYPE</div><div class="mc-meta-val">${m.matchType}</div></div>
                    <div class="mc-meta-box"><div class="mc-meta-lbl">VERSION</div><div class="mc-meta-val">${m.version}</div></div>
                    <div class="mc-meta-box"><div class="mc-meta-lbl">MAP</div><div class="mc-meta-val">${m.map}</div></div>
                </div>

                ${bottomRowHtml}
            </div>
        </div>`;
    });
    wrapper.innerHTML = html;
}

setInterval(() => {
    document.querySelectorAll('.mc-countdown').forEach(el => {
        let target = parseInt(el.getAttribute('data-time'));
        let matchDbId = el.getAttribute('data-id');
        let now = new Date().getTime();
        let diff = target - now;
        
        if(diff <= 0) { 
            el.innerHTML = `<span class="live-dot"></span> Live`; 
            el.style.color = "#ff3366";
            
            let indexToUpdate = allLiveMatches.findIndex(m => m.dbId === matchDbId);
            if(indexToUpdate !== -1 && allLiveMatches[indexToUpdate].status === 'upcoming') {
                allLiveMatches[indexToUpdate].status = 'live';
                
                let matchCard = el.closest('.match-card');
                if(matchCard) {
                    let btnRow = matchCard.querySelector('.mc-bottom-row');
                    if(btnRow) {
                        let isUserJoined = Math.random() > 0.5; 
                        let joinedStatusHtml = isUserJoined ? 
                            `<div style="color:#4ade80; font-weight:bold; font-size:12px; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-circle-check"></i> Joined</div>` : 
                            `<div style="color:#ef4444; font-weight:bold; font-size:12px; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-circle-xmark"></i> Not Joined</div>`;
                        
                        btnRow.innerHTML = `
                            ${joinedStatusHtml}
                            <button class="mc-btn-join" style="background:#ef4444;" onclick="alert('Live room streaming...')"><i class="fa-brands fa-youtube"></i> WATCH LIVE</button>
                        `;
                        btnRow.style.marginTop = "8px";
                    }
                }
            }
        }
        else {
            let d = Math.floor(diff / (1000 * 60 * 60 * 24));
            let h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            let m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            let s = Math.floor((diff % (1000 * 60)) / 1000);
            let timeStr = "";
            if(d > 0) timeStr += `${d}d `;
            timeStr += `${h}h ${m}m ${s}s`;
            el.innerText = `(${timeStr})`;
            el.style.color = "#ffffff"; 
        }
    });
}, 1000);

window.openMyMatches = function(tabName, isBack = false) {
    if(!isBack) pushHistoryState('my-matches');
    hideAllSections();
    document.getElementById('my-matches-section').style.display = 'block';
    setMyMatchesTab(tabName);
    resetAppScroll();
}

window.setMyMatchesTab = function(tabName) {
    document.getElementById('mm-tab-live').classList.remove('active');
    document.getElementById('mm-tab-upcoming').classList.remove('active');
    document.getElementById('mm-tab-completed').classList.remove('active');
    document.getElementById('mm-tab-' + tabName).classList.add('active');
}

// ==========================================
// EMAIL VALIDATION & PROMO LOGIC
// ==========================================
window.emailValidation = async function() {
    const emailBox = document.getElementById('reg-email');
    const icon = document.getElementById('email-check-icon');
    const msg = document.getElementById('email-validation-msg');
    const emailStr = emailBox.value.trim();
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if(emailStr.length === 0) { icon.style.display = 'none'; msg.style.display = 'none'; emailBox.style.borderColor = '#111'; return; }
    if(emailPattern.test(emailStr)) { icon.style.display = 'block'; icon.className = 'fa-solid fa-circle-check'; icon.style.color = '#4ade80'; msg.style.display = 'block'; msg.style.color = '#4ade80'; msg.innerText = "Valid Email Address"; emailBox.style.borderColor = '#4ade80'; } else { icon.style.display = 'block'; icon.className = 'fa-solid fa-circle-xmark'; icon.style.color = '#ff3366'; msg.style.display = 'block'; msg.style.color = '#ff3366'; msg.innerText = "Fake or Invalid Email Format"; emailBox.style.borderColor = '#ff3366'; }
}

window.verifyPromo = async function() {
    const code = document.getElementById('reg-promo').value.trim();
    if(!code) { alert("Please enter a referral code first."); return; }
    showLoader(true);
    try { const refQuery = query(collection(db, "users"), where("referralCode", "==", code)); const refSnap = await getDocs(refQuery); if(refSnap.empty) { alert("❌ Invalid Referral Code!"); document.getElementById('reg-promo').value = ''; } else { alert("✅ Valid Code! Applied."); } showLoader(false); } catch(e) { showLoader(false); alert("Error checking code."); }
}

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================
window.togglePassword = function(inputId, iconElement) { const input = document.getElementById(inputId); if (input.type === "password") { input.type = "text"; iconElement.classList.replace("fa-eye", "fa-eye-slash"); iconElement.style.color = "var(--input-focus)"; } else { input.type = "password"; iconElement.classList.replace("fa-eye-slash", "fa-eye"); iconElement.style.color = "var(--input-icon-placeholder)"; } }
function hideAuthMsgs() { ['reg', 'log', 'forgot'].forEach(id => { let el = document.getElementById(id + '-msg'); if(el) { el.style.display = 'none'; el.style.backgroundColor = 'transparent'; el.style.border = 'none'; }});}
function showAuthMsg(form, msg, isSuccess = false) { hideAuthMsgs(); let el = document.getElementById(form + '-msg'); el.innerText = msg; el.style.display = 'block'; if(isSuccess) { el.style.color = '#4ade80'; el.style.backgroundColor = 'rgba(74, 222, 128, 0.1)'; el.style.border = '1px solid #4ade80'; } else { el.style.color = '#f87171'; el.style.backgroundColor = 'rgba(248, 113, 113, 0.1)'; el.style.border = '1px solid #f87171'; } }
function restartAuthAnimation() { const forms = document.querySelectorAll('.form-container'); forms.forEach(f => { f.style.animation = 'none'; f.offsetHeight; f.style.animation = 'formPopIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards'; }); }

window.showLogin = function() { hideAuthMsgs(); document.getElementById('register-form').style.display = 'none'; document.getElementById('forgot-form').style.display = 'none'; document.getElementById('login-form').style.display = 'block'; restartAuthAnimation(); }
window.showRegister = function() { hideAuthMsgs(); document.getElementById('login-form').style.display = 'none'; document.getElementById('forgot-form').style.display = 'none'; document.getElementById('register-form').style.display = 'block'; restartAuthAnimation(); }
window.showForgot = function() { hideAuthMsgs(); document.getElementById('login-form').style.display = 'none'; document.getElementById('register-form').style.display = 'none'; document.getElementById('forgot-form').style.display = 'block'; restartAuthAnimation(); document.getElementById('forgot-header-wrap').style.display = 'block'; document.getElementById('forgot-success').style.display = 'none'; document.getElementById('forgot-step-1').style.display = 'block'; document.getElementById('forgot-step-2').style.display = 'none'; document.getElementById('forgot-step-3').style.display = 'none'; document.getElementById('forgot-instruction').innerText = "Tournament Verification"; document.getElementById('forgot-email').value = ''; for(let i=1; i<=4; i++) { document.getElementById('otp-'+i).value = ''; } document.getElementById('forgot-new-pwd').value = ''; document.getElementById('forgot-conf-pwd').value = ''; }

function showLoader(state, text = "Processing...") { document.getElementById('loader-text').innerText = text; document.getElementById('full-loader').style.display = state ? 'flex' : 'none'; }
function generateRefCode() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

// ==========================================
// OPTIMIZED CONFETTI SYSTEM (PREVENTS LAG)
// ==========================================
let confettiActive = false;
window.fireCanvasConfetti = function() {
    if(confettiActive) return; 
    confettiActive = true; 
    const canvas = document.getElementById('confetti-canvas'); 
    const ctx = canvas.getContext('2d'); 
    canvas.style.display = 'block'; 
    canvas.width = canvas.offsetWidth; 
    canvas.height = canvas.offsetHeight;
    
    const pieces = []; 
    const colors = ['#ff3366', '#a855f7', '#00ffcc', '#facc15', '#ffffff', '#4ade80']; 
    const maxPieces = 80; // Decreased from 250 to 80 to prevent rendering lag on main UI
    
    for(let i = 0; i < maxPieces; i++) { 
        pieces.push({ 
            x: Math.random() * canvas.width, 
            y: Math.random() * Math.random() * canvas.height - canvas.height, 
            w: Math.random() * 8 + 4, 
            h: Math.random() * 12 + 6, 
            color: colors[Math.floor(Math.random() * colors.length)], 
            speed: Math.random() * 4 + 3, 
            drift: Math.random() * 1.5 - 0.75, 
            rot: Math.random() * 360, 
            rotSpeed: Math.random() * 8 - 4 
        });
    }
    
    function updateAndDraw() { 
        if (!confettiActive) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height); 
        let activePieces = 0; 
        
        for(let i = 0; i < pieces.length; i++) { 
            let p = pieces[i]; 
            if(p.y > canvas.height + 50) continue; 
            activePieces++; 
            p.y += p.speed; 
            p.x += p.drift; 
            p.rot += p.rotSpeed; 
            
            ctx.save(); 
            ctx.translate(p.x, p.y); 
            ctx.rotate(p.rot * Math.PI / 180); 
            ctx.fillStyle = p.color; 
            ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); 
            ctx.restore(); 
        } 
        
        if(activePieces > 0 && confettiActive) { 
            requestAnimationFrame(updateAndDraw); 
        } else { 
            cleanupConfetti();
        } 
    }
    
    function cleanupConfetti() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none'; 
        confettiActive = false;
    }
    
    updateAndDraw(); 
    setTimeout(() => { 
        if(confettiActive){ 
            cleanupConfetti();
        } 
    }, 8000);
}

window.doRegister = async function(btn) {
    const originalText = btn.innerText;
    const fn = document.getElementById('reg-first').value.trim(); const ln = document.getElementById('reg-last').value.trim(); const user = document.getElementById('reg-user').value.trim(); const phoneVal = document.getElementById('reg-phone').value.trim(); const email = document.getElementById('reg-email').value.trim(); const pass = document.getElementById('reg-pwd').value.trim(); const promo = document.getElementById('reg-promo').value.trim();
    if(!fn || !ln || !user || !phoneVal || !email || !pass) { showAuthMsg('reg', 'Please fill all required fields!'); return; } 
    if(pass.length < 6) { showAuthMsg('reg', 'Password must be at least 6 characters!'); return; } 
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/; if(!emailPattern.test(email)) { showAuthMsg('reg', 'Fake or Invalid Email format!'); return; }
    const phone = "+91" + phoneVal; 
    
    btn.innerText = "Processing..."; btn.disabled = true; btn.style.pointerEvents = 'none'; showLoader(true);
    try {
        const userQuery = query(collection(db, "users"), where("username", "==", user)); const userSnap = await getDocs(userQuery); if(!userSnap.empty) { throw new Error('Username is already taken!'); }
        const phoneQuery = query(collection(db, "users"), where("phone", "==", phone)); const phoneSnap = await getDocs(phoneQuery); if(!phoneSnap.empty) { throw new Error('This Phone Number is already registered!'); }
        let referredBy = null; if(promo) { const refQuery = query(collection(db, "users"), where("referralCode", "==", promo)); const refSnap = await getDocs(refQuery); if(refSnap.empty) { throw new Error('Invalid Referral Code!'); } referredBy = refSnap.docs[0].id; }
        const cred = await createUserWithEmailAndPassword(auth, email, pass); const uid = cred.user.uid; const now = new Date();
        await setDoc(doc(db, "users", uid), { firstName: fn, lastName: ln, username: user, phone: phone, email: email, password: pass, balance: 0, winningCash: 0, bonusCash: 0, status: 'active', uidStatus: '', gameId: '', gameUid: '', referralCode: generateRefCode(), referredBy: referredBy, createdAt: now.toISOString().replace('T', ' ').substring(0, 19), timestamp: now.getTime() });
        sessionStorage.setItem('triggerConfetti', 'true'); 
    } catch(e) { 
        let msg = e.message; if(e.code === 'auth/email-already-in-use') msg = 'Email is already registered!'; else if(e.code === 'auth/invalid-email') msg = 'Invalid Email format!'; 
        showAuthMsg('reg', msg); 
    } finally {
        showLoader(false); btn.innerText = originalText; btn.disabled = false; btn.style.pointerEvents = 'auto';
    }
}

window.doLogin = async function(btn) {
    const originalText = btn.innerText;
    const idInput = document.getElementById('log-id').value.trim(); const pass = document.getElementById('log-pwd').value.trim(); 
    if(!idInput || !pass) { showAuthMsg('log', 'Please enter Phone or Email & Password!'); return; } 
    
    btn.innerText = "Processing..."; btn.disabled = true; btn.style.pointerEvents = 'none'; showLoader(true);
    try { 
        let loginEmail = idInput; 
        if (/^\d{10}$/.test(idInput)) { const phoneStr = "+91" + idInput; const uQuery = query(collection(db, "users"), where("phone", "==", phoneStr)); const uSnap = await getDocs(uQuery); if(uSnap.empty) { throw new Error('Phone number not registered!'); } loginEmail = uSnap.docs[0].data().email; } else if (!idInput.includes('@')) { throw new Error('Please enter a valid Phone Number or Email!'); }
        await signInWithEmailAndPassword(auth, loginEmail, pass); sessionStorage.setItem('triggerConfetti', 'true'); 
    } catch(e) { 
        let msg = e.message; if(e.code === 'auth/user-not-found' || e.code === 'auth/invalid-login-credentials') msg = 'Login Failed: Invalid Credentials!'; else if(e.code === 'auth/too-many-requests') msg = 'Too many attempts. Try again later.'; 
        showAuthMsg('log', msg); 
    } finally {
        showLoader(false); btn.innerText = originalText; btn.disabled = false; btn.style.pointerEvents = 'auto';
    }
}

// ================= FORGOT PASSWORD LOGIC (FIXED DOUBLE OTP AND STRICT MODE) =================
let resetEmail = ""; let resetDocId = ""; let resetOldPassword = ""; let generatedOTP = "";
window.handleOtpInput = function(current, nextFieldID) { if (current.value.length >= 1) { current.value = current.value.slice(0, 1); if(nextFieldID) document.getElementById(nextFieldID).focus(); } }
window.handleOtpBackspace = function(e, prevFieldID, currentID) { if(e.key === 'Backspace') { const currentBox = document.getElementById(currentID); if(currentBox.value === '' && prevFieldID) { const prevBox = document.getElementById(prevFieldID); prevBox.focus(); prevBox.value = ''; } else { currentBox.value = ''; } } }

window.sendOTP = async function(btn) {
    if(isSendingOTP) return; 
    const email = document.getElementById('forgot-email').value.trim(); 
    if(!email || !email.includes("@")) { showAuthMsg('forgot', 'Please enter a valid registered email address!'); return; } 
    
    isSendingOTP = true; 
    const originalText = btn.innerText; 
    btn.innerText = "Sending..."; btn.disabled = true; btn.style.pointerEvents = 'none'; 
    showLoader(true);
    
    try { 
        const q = query(collection(db, "users"), where("email", "==", email)); const snap = await getDocs(q); if(snap.empty) { throw new Error('Email not registered in database'); } 
        resetDocId = snap.docs[0].id; resetOldPassword = snap.docs[0].data().password; resetEmail = email; 
        
        const ejsDoc = await getDoc(doc(db, "admin_settings", "emailjs_config")); 
        if(!ejsDoc.exists() || !ejsDoc.data().publicKey) { throw new Error('Error: Email Server is not configured by Admin!'); } 
        const ejsData = ejsDoc.data(); 
        
        generatedOTP = Math.floor(1000 + Math.random() * 9000).toString(); 
        
        // Passing public key as 4th parameter perfectly bypasses Strict Mode validation issues on EmailJS
        await emailjs.send(
            ejsData.serviceId, 
            ejsData.templateId, 
            { to_email: email, otp: generatedOTP }, 
            ejsData.publicKey
        ); 
        
        document.getElementById('forgot-step-1').style.display = 'none'; 
        document.getElementById('forgot-step-2').style.display = 'block'; 
        document.getElementById('forgot-instruction').innerText = "Check your inbox for the code."; 
        showAuthMsg('forgot', 'OTP sent successfully to ' + email, true); 
        setTimeout(() => { document.getElementById('otp-1').focus(); }, 300); 
    } catch(e) { 
        showAuthMsg('forgot', 'Failed: ' + (e.text || e.message)); 
    } finally { 
        showLoader(false); btn.innerText = originalText; btn.disabled = false; btn.style.pointerEvents = 'auto'; 
        isSendingOTP = false; 
    }
}

window.verifyOTP = function() { let finalOTP = document.getElementById('otp-1').value + document.getElementById('otp-2').value + document.getElementById('otp-3').value + document.getElementById('otp-4').value; if(finalOTP.length !== 4) { showAuthMsg('forgot', 'Please enter full 4-Digit OTP!'); return; } if(finalOTP === generatedOTP) { document.getElementById('forgot-step-2').style.display = 'none'; document.getElementById('forgot-step-3').style.display = 'block'; document.getElementById('forgot-instruction').innerText = "Set your new secure password."; showAuthMsg('forgot', '✅ OTP Verified! Create a new password.', true); } else { showAuthMsg('forgot', '❌ Invalid OTP! Please check again.'); } }

window.changePassword = async function(btn) { 
    const newPass = document.getElementById('forgot-new-pwd').value.trim(); const confPass = document.getElementById('forgot-conf-pwd').value.trim(); 
    if(newPass.length < 6) { showAuthMsg('forgot', 'Password must be at least 6 characters!'); return; } if(newPass !== confPass) { showAuthMsg('forgot', 'Passwords do not match! Please check.'); return; } 
    const originalText = btn.innerText; btn.innerText = "Updating..."; btn.disabled = true; btn.style.pointerEvents = 'none'; showLoader(true); isResettingPassword = true; 
    try { 
        const cred = await signInWithEmailAndPassword(auth, resetEmail, resetOldPassword); 
        await updatePassword(cred.user, newPass); await setDoc(doc(db, "users", resetDocId), { password: newPass }, { merge: true }); 
        await signOut(auth); 
        document.getElementById('forgot-header-wrap').style.display = 'none'; document.getElementById('forgot-step-3').style.display = 'none'; document.getElementById('forgot-success').style.display = 'block'; fireCanvasConfetti(); 
        setTimeout(() => { isResettingPassword = false; showLogin(); }, 4000); 
    } catch(e) { isResettingPassword = false; showAuthMsg('forgot', 'Error changing password: ' + e.message); }
    finally { showLoader(false); btn.innerText = originalText; btn.disabled = false; btn.style.pointerEvents = 'auto'; }
}

window.logoutUser = async function() { 
    if(confirm("Are you sure you want to log out?")) { 
        showLoader(true, "Logging Out...");
        try { await signOut(auth); setTimeout(() => { window.location.reload(); }, 800); } catch(e) { showLoader(false); alert("Logout failed: " + e.message); }
    } 
}

function runCounters() {
    const counters = document.querySelectorAll('.counter'); const speed = 50; 
    counters.forEach(counter => {
        const target = +counter.getAttribute('data-target'); if(target === 0) { counter.innerText = '0'; return; }
        const updateCount = () => { const count = +counter.innerText; const inc = target / speed; if (count < target) { counter.innerText = Math.ceil(count + inc); setTimeout(updateCount, 20); } else { counter.innerText = target; } };
        updateCount();
    });
}

async function loadRecentTransactions(uid) {
    try {
        let trx = [];
        const depSnap = await getDocs(query(collection(db, "deposits"), where("userId", "==", uid))); depSnap.forEach(d => { let t = d.data(); t.type = 'deposit'; trx.push(t); });
        const witSnap = await getDocs(query(collection(db, "withdrawals"), where("userId", "==", uid))); witSnap.forEach(d => { let t = d.data(); t.type = 'withdrawal'; trx.push(t); });
        trx.sort((a,b) => b.timestamp - a.timestamp); globalTransactions = trx; renderTransactions();
    } catch(e) {}
}

function renderTransactions() {
    let limitWallet = 3; let wHtml = ''; let fHtml = '';
    if(globalTransactions.length === 0) { wHtml = '<div class="w-empty-state"><i class="fa-solid fa-receipt" style="font-size:26px; opacity:0.3; display:block; margin-bottom:8px;"></i>No transactions yet.</div>'; fHtml = wHtml; } else {
        globalTransactions.forEach((t, i) => {
            let dt = new Date(t.timestamp).toLocaleString(); let icon = t.type === 'deposit' ? '<i class="fa-solid fa-arrow-down"></i>' : '<i class="fa-solid fa-arrow-up"></i>'; let typeClass = t.type === 'deposit' ? 'dep' : 'wit'; let sign = t.type === 'deposit' ? '+' : '-'; let title = t.type === 'deposit' ? 'Deposit' : 'Withdrawal'; let method = t.type === 'deposit' ? (t.methodName || 'Wallet') : (t.upiId || 'Bank');
            let stHtml = ''; if(t.status === 'pending') stHtml = '<span class="trx-status st-pend">Pending</span>'; else if(t.status === 'approved') stHtml = '<span class="trx-status st-appr">Success</span>'; else stHtml = '<span class="trx-status st-rej">Failed</span>';
            let itemHtml = `<div class="trx-item tactile-3d"><div class="trx-left"><div class="trx-icon ${typeClass}">${icon}</div><div class="trx-details"><h4>${title}</h4><p>${dt}<br>${method}</p></div></div><div class="trx-right"><div class="trx-amt ${typeClass} game-font">${sign}₹${t.amount}</div>${stHtml}</div></div>`;
            if(i < limitWallet) wHtml += itemHtml; fHtml += itemHtml;
        });
    }
    document.getElementById('wallet-trx-list').innerHTML = wHtml; document.getElementById('full-trx-list').innerHTML = fHtml;
}

// ==========================================
// LAZY LOADING USER DATA
// ==========================================
function loadUserData(user) {
    hideAllSections(); 
    document.getElementById('app-container').style.opacity = '1'; 
    const shimmer = document.getElementById('shimmer-screen'); 
    shimmer.style.display = 'flex'; 
    shimmer.style.opacity = '1';
    
    if(!window.history.state) { window.history.replaceState({id: 'home'}, '', ''); currentActiveTab = 'home'; }

    const userDocRef = doc(db, "users", user.uid);
    onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            currentUserDoc = docSnap.data(); 
            if(currentUserDoc.status !== 'active') { signOut(auth); alert("Your account is blocked! Contact Admin."); return; }
            
            const uidStat = currentUserDoc.uidStatus;
            if(uidStat !== 'approved') {
                shimmer.style.opacity = '0'; setTimeout(() => shimmer.style.display = 'none', 400);
                document.getElementById('fab-contact-btn').style.display = 'none'; document.getElementById('uid-verification-section').style.display = 'flex';
                if(uidStat === 'pending') { document.getElementById('uid-form-state').style.display = 'none'; document.getElementById('uid-pending-state').style.display = 'block'; document.getElementById('uid-submitted-val').innerText = currentUserDoc.gameUid || 'N/A'; } else { document.getElementById('uid-form-state').style.display = 'block'; document.getElementById('uid-pending-state').style.display = 'none'; if(uidStat === 'rejected') { document.getElementById('uid-reject-msg').style.display = 'block'; document.getElementById('uid-reject-msg').innerText = "Rejected: " + (currentUserDoc.uidRejectReason || "Invalid Details"); } }
                return; 
            }

            let tBal = parseFloat(currentUserDoc.balance || 0); let wBal = parseFloat(currentUserDoc.winningCash || 0); let bBal = parseFloat(currentUserDoc.bonusCash || 0); let dBal = tBal - wBal - bBal; if(dBal < 0) dBal = 0; 
            
            document.getElementById('ui-live-balance').innerText = `${tBal.toFixed(0)}`;
            document.getElementById('w-total-bal').innerText = tBal.toFixed(0); 
            document.getElementById('w-win-bal').innerText = wBal.toFixed(0); 
            document.getElementById('w-bon-bal').innerText = bBal.toFixed(0); 
            document.getElementById('w-dep-bal').innerText = dBal.toFixed(0); 
            document.getElementById('am-dep-show').innerText = `${dBal.toFixed(0)}`; 
            document.getElementById('wm-bal-show').innerText = `${wBal.toFixed(0)}`;
            
            document.getElementById('pro-name-show').innerText = currentUserDoc.gameId || currentUserDoc.username;
            document.getElementById('pro-uid-val').innerText = currentUserDoc.gameUid || user.uid.substring(0, 8).toUpperCase();
            
            if(document.getElementById('pro-tot-bal').innerText === "0"){
                document.getElementById('pro-tot-bal').setAttribute('data-target', tBal.toFixed(0));
                document.getElementById('pro-stat-matches').setAttribute('data-target', currentUserDoc.matchesPlayed || 0);
                document.getElementById('pro-stat-kills').setAttribute('data-target', currentUserDoc.totalKills || 0);
            }
            
            document.getElementById('pro-win-bal').innerHTML = `<img src="https://i.ibb.co/HLK8R51v/Untitled13-20260512152418.png" class="coin-icon" style="width:16px; height:16px;"> ${wBal.toFixed(0)}`; 
            document.getElementById('pro-bon-bal').innerHTML = `<img src="https://i.ibb.co/HLK8R51v/Untitled13-20260512152418.png" class="coin-icon" style="width:16px; height:16px;"> ${bBal.toFixed(0)}`; 
            document.getElementById('pro-dep-bal').innerHTML = `<img src="https://i.ibb.co/HLK8R51v/Untitled13-20260512152418.png" class="coin-icon" style="width:16px; height:16px;"> ${dBal.toFixed(0)}`; 
            document.getElementById('pro-stat-toprank').innerText = `#${currentUserDoc.topRank || 0}`;

            fetchNotifications(user.uid); 
            loadRecentTransactions(user.uid);

            if (shimmer.style.display !== 'none') {
                setTimeout(() => {
                    shimmer.style.opacity = '0'; 
                    setTimeout(() => { 
                        shimmer.style.display = 'none'; 
                        showHomePanel(); 
                        if(sessionStorage.getItem('triggerConfetti') === 'true') { setTimeout(() => { fireCanvasConfetti(); }, 400); sessionStorage.removeItem('triggerConfetti'); } 
                    }, 300); 
                }, 5200);
            }

        } else { signOut(auth); alert("Account data not found!"); }
    });
}

onAuthStateChanged(auth, async (user) => {
    if(isResettingPassword) return; 
    if (user) {
        loadUserData(user);
    } else { 
        hideAllSections(); document.getElementById('fab-contact-btn').style.display = 'none'; document.getElementById('auth-section').style.display = 'flex'; document.getElementById('shimmer-screen').style.display = 'none'; currentUserDoc = null; 
    }
});

window.submitUidVerification = async function() {
    const gid = document.getElementById('verify-game-id').value.trim(); const guid = document.getElementById('verify-game-uid').value.trim();
    if(!gid || !guid) { alert("Please enter both In-Game Name and UID!"); return; }
    showLoader(true);
    try { await updateDoc(doc(db, "users", auth.currentUser.uid), { gameId: gid, gameUid: guid, uidStatus: 'pending', uidSubmittedAt: Date.now() }); document.getElementById('uid-form-state').style.display = 'none'; document.getElementById('uid-pending-state').style.display = 'block'; document.getElementById('uid-submitted-val').innerText = guid; if(currentUserDoc) currentUserDoc.uidStatus = 'pending'; showLoader(false); } catch(e) { showLoader(false); alert("Error: " + e.message); }
}

function updateNavActive(navId) { document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active')); if(navId) document.getElementById(navId).classList.add('active'); }
function resetAppScroll() { document.querySelectorAll('.page-section').forEach(el => el.scrollTop = 0); document.getElementById('auth-section').scrollTop = 0; document.getElementById('bottom-nav').classList.remove('hide-nav'); }
function hideAllSections() { document.querySelectorAll('.page-section').forEach(el => { el.style.display = 'none'; el.classList.remove('active-page'); }); document.getElementById('auth-section').style.display = 'none'; document.getElementById('bottom-nav').style.display = 'none'; document.getElementById('fab-contact-btn').style.display = 'none'; }
function showNav() { document.getElementById('bottom-nav').style.display = 'flex'; }

window.showHomePanel = function(isBack = false) { 
    if(!isBack) pushHistoryState('home');
    hideAllSections(); let hs = document.getElementById('home-section'); hs.style.display = 'block'; hs.offsetHeight; hs.classList.add('active-page'); showNav(); updateNavActive('nav-home'); resetAppScroll(); if(appProfileSettings.contact_link) document.getElementById('fab-contact-btn').style.display = 'flex';
}
window.showWallet = function(isBack = false) { 
    if(!isBack) pushHistoryState('wallet');
    hideAllSections(); document.getElementById('wallet-section').style.display = 'block'; showNav(); updateNavActive('nav-wal'); resetAppScroll(); 
}
window.showTopWinners = function(isBack = false) { 
    if(!isBack) pushHistoryState('top');
    hideAllSections(); document.getElementById('top-section').style.display = 'block'; showNav(); updateNavActive('nav-top'); resetAppScroll(); 
}
window.showReferral = function(isBack = false) { 
    if(!isBack) pushHistoryState('refer');
    hideAllSections(); document.getElementById('ref-section').style.display = 'block'; showNav(); updateNavActive('nav-ref'); resetAppScroll(); 
}
window.showProfile = function(isBack = false) { 
    if(!isBack) pushHistoryState('profile');
    hideAllSections(); document.getElementById('profile-section').style.display = 'block'; showNav(); updateNavActive('nav-pro'); resetAppScroll(); runCounters(); 
}
window.showUpdatesList = function(isBack = false) { 
    if(!isBack) pushHistoryState('updates');
    hideAllSections(); document.getElementById('updates-list-section').style.display = 'block'; resetAppScroll(); 
}
window.showNotifications = function(isBack = false) { 
    if(!isBack) pushHistoryState('notifications');
    document.getElementById('noti-badge-dot').style.display = 'none'; hideAllSections(); document.getElementById('notifications-section').style.display = 'block'; resetAppScroll(); 
}
window.showTransactionHistory = function(isBack = false) { 
    if(!isBack) pushHistoryState('history');
    hideAllSections(); document.getElementById('trx-history-section').style.display = 'block'; resetAppScroll(); 
}

window.openPolicyViewer = function(policyKey, policyTitle) {
    document.getElementById('policy-title').innerText = policyTitle;
    let htmlData = appProfileSettings[policyKey] || `<h2>${policyTitle}</h2><p>Not updated by admin yet.</p>`;
    document.getElementById('policy-content').innerHTML = htmlData;
    pushHistoryState('policy');
    hideAllSections(); document.getElementById('policy-viewer-section').style.display = 'block'; resetAppScroll();
}

window.openGameUidModal = function() { document.getElementById('prof-game-id').value = currentUserDoc.gameId || ''; document.getElementById('prof-game-uid').value = currentUserDoc.gameUid || ''; document.getElementById('uid-modal').style.display = 'flex'; }
window.openPasswordModal = function() { document.getElementById('old-sec-pass').value = ''; document.getElementById('new-sec-pass').value = ''; document.getElementById('conf-sec-pass').value = ''; document.getElementById('password-modal').style.display = 'flex'; }
window.closeGlassModal = function(id) { document.getElementById(id).style.display = 'none'; }

window.submitChangeUid = async function() {
    const gid = document.getElementById('prof-game-id').value.trim(); const guid = document.getElementById('prof-game-uid').value.trim();
    if(!gid || !guid) { alert("Enter valid ID and UID"); return; }
    try { 
        showLoader(true); await updateDoc(doc(db, "users", auth.currentUser.uid), { gameId: gid, gameUid: guid, uidStatus: 'pending', uidSubmittedAt: Date.now() }); 
        currentUserDoc.gameId = gid; currentUserDoc.gameUid = guid; currentUserDoc.uidStatus = 'pending';
        closeGlassModal('uid-modal'); alert("UID submitted for verification!"); showLoader(false); window.location.reload(); 
    } catch(e) { alert("Error: " + e.message); showLoader(false); } 
}

window.submitChangePassword = async function() {
    const oldPass = document.getElementById('old-sec-pass').value.trim(); const newPass = document.getElementById('new-sec-pass').value.trim(); const confPass = document.getElementById('conf-sec-pass').value.trim();
    if(!oldPass) { alert("Please enter old password!"); return; } if(newPass.length < 6) { alert("New password must be at least 6 characters."); return; } if(newPass !== confPass) { alert("Passwords do not match!"); return; }
    try { 
        showLoader(true); const credential = EmailAuthProvider.credential(auth.currentUser.email, oldPass); await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPass); await updateDoc(doc(db, "users", auth.currentUser.uid), { password: newPass }); currentUserDoc.password = newPass; 
        closeGlassModal('password-modal'); alert("Password Updated Successfully!"); showLoader(false);
    } catch(e) { if(e.code === 'auth/wrong-password') { alert("Incorrect Old Password!"); } else { alert("Error: " + e.message); } showLoader(false); } 
}

function hexToRgba(hex, opacity) { if(!hex) return ''; hex = hex.replace('#', ''); if(hex.length === 3) hex = hex.split('').map(char => char + char).join(''); const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16); return `rgba(${r}, ${g}, ${b}, ${opacity})`; }

// ==========================================
// REAL-TIME LEADERBOARD LOGIC
// ==========================================
async function fetchTopPlayers() {
    try {
        const topQuery = query(collection(db, "users"), orderBy("winningCash", "desc"));
        const snapshot = await getDocs(topQuery);
        
        let rank = 1;
        let listHtml = '';
        const coinImg = appProfileSettings.coin_image_url || "https://i.ibb.co/HLK8R51v/Untitled13-20260512152418.png";
        let defaultAvatarUrl = "https://i.ibb.co/Cc0pcPF/file-000000000e48720bbdd6943440c3a683.png";

        const loadingText = document.getElementById('loading-text');
        if(loadingText) loadingText.style.display = "none";
        
        snapshot.forEach(docSnap => {
            const userData = docSnap.data();
            const displayName = userData.gameId || userData.username || "UNKNOWN";
            const scoreVal = parseFloat(userData.winningCash || 0).toFixed(0);
            const userAvatar = userData.avatar_url || defaultAvatarUrl;

            if(rank === 1) {
                let nameEl = document.getElementById('p-name-1'); if(nameEl) nameEl.innerText = displayName;
                let imgEl = document.getElementById('p-img-1'); if(imgEl) imgEl.src = userAvatar;
                let scoreEl = document.getElementById('p-score-1'); if(scoreEl) scoreEl.innerHTML = `<img src="${coinImg}" class="coin-icon" style="width:16px; height:16px;"> ${scoreVal}`;
            } 
            else if(rank === 2) {
                let nameEl = document.getElementById('p-name-2'); if(nameEl) nameEl.innerText = displayName;
                let imgEl = document.getElementById('p-img-2'); if(imgEl) imgEl.src = userAvatar;
                let scoreEl = document.getElementById('p-score-2'); if(scoreEl) scoreEl.innerHTML = `<img src="${coinImg}" class="coin-icon" style="width:16px; height:16px;"> ${scoreVal}`;
            } 
            else if(rank === 3) {
                let nameEl = document.getElementById('p-name-3'); if(nameEl) nameEl.innerText = displayName;
                let imgEl = document.getElementById('p-img-3'); if(imgEl) imgEl.src = userAvatar;
                let scoreEl = document.getElementById('p-score-3'); if(scoreEl) scoreEl.innerHTML = `<img src="${coinImg}" class="coin-icon" style="width:16px; height:16px;"> ${scoreVal}`;
            } 
            else {
                listHtml += `
                <div class="lb-item">
                    <div class="lb-rank">#${rank}</div>
                    <div class="lb-user-info">
                        <div class="lb-user-frame-container">
                            <div class="lb-user-frame" style="background-image: url('https://i.ibb.co/VcLyChwG/detailed-watercolor-circle-frame-863013-93268.png')"></div>
                            <img class="lb-user-avatar" src="${userAvatar}" alt="player">
                        </div>
                        <div class="lb-user-name">${displayName}</div>
                    </div>
                    <div class="lb-user-score game-font flex-amt">
                        <img src="${coinImg}" class="coin-icon" style="width:16px; height:16px;"> ${scoreVal}
                    </div>
                </div>`;
            }
            rank++;
        });

        const listContainer = document.getElementById('leaderboard-list-items');
        if(listContainer) {
            listContainer.innerHTML = listHtml || '<div style="text-align:center; padding:15px; color:#888;">No players ranked yet</div>';
        }

    } catch(e) {
        console.log("Error loading top players: ", e);
    }
}

// ==========================================
// CORE FIREBASE UI & CONFIGURATION FETCH
// ==========================================
async function fetchUIControls() {
    try {
        if(!navigator.onLine) { document.getElementById('app-container').style.opacity = '1'; uiFetched = true; return; }
        
        const appSetDoc = await getDoc(doc(db, "admin_settings", "app_display"));
        if(appSetDoc.exists() && appSetDoc.data().app_welcome_name) {
            document.getElementById('ui-txt-appname').innerText = appSetDoc.data().app_welcome_name;
        } else {
            document.getElementById('ui-txt-appname').innerText = "Squad Fire";
        }

        const authDoc = await getDoc(doc(db, "ui_controls", "user_panel"));
        if(authDoc.exists()) {
            const data = authDoc.data();
            root.style.setProperty('--bg-top', data.background.top); root.style.setProperty('--bg-bottom', data.background.bottom);
            root.style.setProperty('--popup-left', data.popup.left); root.style.setProperty('--popup-right', data.popup.right);
            root.style.setProperty('--title-g1', data.header.color1); root.style.setProperty('--title-g2', data.header.color2);
            root.style.setProperty('--input-bg', data.input.bg); const rgbaVal = hexToRgba(data.input.textColor, data.input.opacity); root.style.setProperty('--input-text', rgbaVal); root.style.setProperty('--input-icon-placeholder', rgbaVal);
            root.style.setProperty('--input-focus', data.input.focusColor); root.style.setProperty('--apply-bg', data.applyBtn.bg); root.style.setProperty('--apply-text', data.applyBtn.text); root.style.setProperty('--link-color', data.bottomLink);
            if(data.animations) { root.style.setProperty('--title-anim', data.animations.title || 'none'); root.style.setProperty('--submit-anim', data.animations.submit || 'none'); }
            if(data.submitBtn.type === "solid") { root.style.setProperty('--submit-bg', data.submitBtn.color1); } else { root.style.setProperty('--submit-bg', `linear-gradient(90deg, ${data.submitBtn.color1}, ${data.submitBtn.color2})`); }
        }

        if(!auth.currentUser) { setTimeout(() => { document.getElementById('app-container').style.opacity = '1'; }, 100); }

        const homeDoc = await getDoc(doc(db, "ui_controls", "home_layout"));
        if(homeDoc.exists()) { 
            const data = homeDoc.data(); 
            for (const [key, value] of Object.entries(data)) { 
                if(key !== 'accIconMode' && key !== '--h-bal-bg') root.style.setProperty(key, value); 
            } 
            if(data['--h-bal-bg1']) root.style.setProperty('--h-bal-bg', data['--h-bal-bg1']); 
            const iconMode = data.accIconMode || 'custom';
            document.querySelectorAll('.h-acc-item').forEach(el => { el.setAttribute('data-mode', iconMode); });

            // Apply eSport Games label variables seamlessly
            if(data['--h-lbl-font-size']) root.style.setProperty('--h-lbl-font-size', data['--h-lbl-font-size']);
            if(data['--h-lbl-font-weight']) root.style.setProperty('--h-lbl-font-weight', data['--h-lbl-font-weight']);
            if(data['--h-lbl-text-color']) root.style.setProperty('--h-lbl-text-color', data['--h-lbl-text-color']);
        }
        
        const walDoc = await getDoc(doc(db, "ui_controls", "wallet_layout"));
        if(walDoc.exists()) { const data = walDoc.data(); for (const [key, value] of Object.entries(data)) { root.style.setProperty(key, value); } }
        
        const amDoc = await getDoc(doc(db, "ui_controls", "addmoney_layout"));
        if(amDoc.exists()) { const data = amDoc.data(); for (const [key, value] of Object.entries(data)) { root.style.setProperty(key, value); } }
        
        const textDoc = await getDoc(doc(db, "ui_controls", "home_texts"));
        if(textDoc.exists()) { 
            const t = textDoc.data(); 
            if(t.welcomeName) document.getElementById('ui-txt-wel').innerText = t.welcomeName; 
            if(t.announceText) {
                let cleanText = t.announceText.replace(' <span class="fire-emoji">🔥</span>', '');
                document.getElementById('ui-txt-ann').innerHTML = cleanText + ' <span class="fire-emoji">🔥</span>'; 
            }
            if(t.accTitle) document.getElementById('ui-txt-acc').innerText = t.accTitle; 
            if(t.conTitle) document.getElementById('ui-txt-con').innerText = t.conTitle; 
            if(t.gameTitle) document.getElementById('ui-txt-game').innerText = t.gameTitle; 
        }

        const logoDoc = await getDoc(doc(db, "ui_controls", "top_logo"));
        if(logoDoc.exists()) { 
            const l = logoDoc.data(); 
            const logoEl = document.getElementById('ui-logo'); 
            const linkEl = document.getElementById('ui-top-logo-link'); 
            if(l.imgUrl) { 
                logoEl.style.backgroundImage = `url('${l.imgUrl}')`; 
                logoEl.style.backgroundColor = 'transparent'; 
                logoEl.style.border = 'none';
            } 
            if(l.targetUrl) { linkEl.href = l.targetUrl; } else { linkEl.removeAttribute("href"); } 
        }

        const profileDoc = await getDoc(doc(db, "ui_controls", "profile_settings"));
        if(profileDoc.exists()) {
            appProfileSettings = profileDoc.data();
            
            if(appProfileSettings.coin_image_url) {
                document.querySelectorAll('.coin-icon').forEach(img => {
                    img.src = appProfileSettings.coin_image_url;
                });
            }
            
            if(appProfileSettings.avatar_url) document.getElementById('pro-avatar-img').src = appProfileSettings.avatar_url;
            if(appProfileSettings.profile_cover) document.getElementById('pro-cover-img').style.backgroundImage = `url('${appProfileSettings.profile_cover}')`;
            
            const iInsta = document.getElementById('social-insta'); if(appProfileSettings.social_insta) { iInsta.style.display = 'inline-block'; iInsta.onclick = () => window.open(appProfileSettings.social_insta, '_blank'); }
            const iYt = document.getElementById('social-yt'); if(appProfileSettings.social_yt) { iYt.style.display = 'inline-block'; iYt.onclick = () => window.open(appProfileSettings.social_yt, '_blank'); }
            const iTg = document.getElementById('social-tg'); if(appProfileSettings.social_tg) { iTg.style.display = 'inline-block'; iTg.onclick = () => window.open(appProfileSettings.social_tg, '_blank'); }
            const fBtn = document.getElementById('fab-contact-btn'); if(appProfileSettings.contact_link) { fBtn.onclick = () => window.open(appProfileSettings.contact_link, '_blank'); }

            if(appProfileSettings.uid_inst_text) document.getElementById('uid-inst-show').innerText = appProfileSettings.uid_inst_text;
            if(appProfileSettings.uid_step_img) { document.getElementById('uid-step-img-show').src = appProfileSettings.uid_step_img; document.getElementById('uid-step-img-show').style.display = 'block'; }
        }

        const updQuery = query(collection(db, "important_updates"), orderBy("timestamp", "desc")); const updSnap = await getDocs(updQuery);
        const listContainer = document.getElementById('ui-updates-list-container'); listContainer.innerHTML = ''; globalUpdatesData = []; 
        if(!updSnap.empty) { let index = 0; updSnap.forEach(doc => { let d = doc.data(); globalUpdatesData.push(d); listContainer.innerHTML += `<div class="u-box tactile-3d" onclick="openFullPost(${index})"><i class="fa-solid fa-bullhorn"></i><div><h4>${d.title}</h4><p>${d.time}</p></div><i class="fa-solid fa-angle-right" style="margin-left:auto; font-size:16px;"></i></div>`; index++; }); } else { listContainer.innerHTML = '<p style="text-align:center; padding: 20px; color:#888; font-size:12px;">No updates found.</p>'; }

        const gamesSnap = await getDocs(collection(db, "games_list")); const gameContainer = document.getElementById('ui-games-container'); gameContainer.innerHTML = '';
        if(!gamesSnap.empty) { gamesSnap.forEach(g => { let gd = g.data(); gameContainer.innerHTML += `<div class="h-game-card tactile-3d" onclick="openGameMatches('${gd.name}')"><div class="h-game-img" style="background-image:url('${gd.imgUrl}')"></div><div class="h-game-lbl">${gd.name}</div></div>`; }); } else { gameContainer.innerHTML = '<p style="color:#888; text-align:center; font-size:11px; grid-column:1/-1;">No games available</p>'; }

        const amSetDoc = await getDoc(doc(db, "admin_settings", "add_money"));
        if(amSetDoc.exists()) {
            const data = amSetDoc.data();
            addMoneySettings.min = data.minAmount || 10; addMoneySettings.max = data.maxAmount || 10000; addMoneySettings.btnText = data.btnText || 'Proceed to Pay'; 
        }
        const appSetDoc2 = await getDoc(doc(db, "settings", "app"));
        if(appSetDoc2.exists() && appSetDoc2.data().minWithdraw) { minWithdrawLimit = parseFloat(appSetDoc2.data().minWithdraw) || 50; }

        document.getElementById('am-min-txt').innerText = `Min: ₹${addMoneySettings.min}`; document.getElementById('am-max-txt').innerText = `Max: ₹${addMoneySettings.max}`; document.getElementById('am-btn-text').innerText = addMoneySettings.btnText; document.getElementById('wm-amt').placeholder = `Amount (Min ₹${minWithdrawLimit})`;

        const presetHtml = [20, 50, 100, 200, 500, 1000].map(amt => `<button class="amount-preset-btn tactile-3d" onclick="document.getElementById('am-amount').value=${amt};">₹${amt}</button>`).join('');
        document.getElementById('am-presets').innerHTML = presetHtml;

        const promoSnap = await getDocs(collection(db, "promo_banners")); 
        const track = document.getElementById('ui-banner-track'); const dotsContainer = document.getElementById('ui-banner-dots'); 
        track.innerHTML = ''; dotsContainer.innerHTML = ''; let slideCount = 0;
        
        if(!promoSnap.empty) { 
            promoSnap.forEach(doc => { 
                let p = doc.data(); track.innerHTML += `<a href="${p.targetUrl || '#'}" target="${p.targetUrl ? '_blank' : '_self'}" class="h-banner-slide" style="background-image:url('${p.imgUrl}')"></a>`; 
                dotsContainer.innerHTML += `<span class="dot ${slideCount === 0 ? 'active' : ''}"></span>`; slideCount++; 
            }); 
            if(slideCount > 1) { 
                const dots = dotsContainer.querySelectorAll('.dot'); let isDragging = false; let startPos = 0, currentTranslate = 0, prevTranslate = 0; let currentIndex = 0; let autoSlideInt;
                function snapSlide() { track.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)'; prevTranslate = currentIndex * -100; track.style.transform = `translateX(${prevTranslate}%)`; dots.forEach(d => d.classList.remove('active')); if(dots[currentIndex]) dots[currentIndex].classList.add('active'); }
                function startAutoSlide() { clearInterval(autoSlideInt); autoSlideInt = setInterval(() => { currentIndex = (currentIndex + 1) % slideCount; snapSlide(); }, 3500); }
                track.addEventListener('touchstart', (e) => { isDragging = true; startPos = e.touches[0].clientX; track.style.transition = 'none'; clearInterval(autoSlideInt); }, {passive: true});
                track.addEventListener('touchmove', (e) => { if (!isDragging) return; const currentPosition = e.touches[0].clientX; const diff = currentPosition - startPos; const diffPercent = (diff / track.offsetWidth) * 100; currentTranslate = prevTranslate + diffPercent; track.style.transform = `translateX(${currentTranslate}%)`; }, {passive: true});
                track.addEventListener('touchend', () => { isDragging = false; const diff = currentTranslate - prevTranslate; if (diff < -15) { currentIndex = (currentIndex + 1) % slideCount; } else if (diff > 15) { currentIndex = (currentIndex - 1 + slideCount) % slideCount; } snapSlide(); startAutoSlide(); });
                startAutoSlide();
            } 
        } else { document.getElementById('ui-banner-box').innerHTML = '<div style="width:100%;height:100%;background:#444;display:flex;align-items:center;justify-content:center;color:#fff;">No Banner Found</div>'; }

        fetchTopPlayers();

        uiFetched = true;
    } catch(e) { console.log("Firebase Load Error: ", e); document.getElementById('app-container').style.opacity = '1'; uiFetched = true;}
}

async function fetchNotifications(uid) {
    const listCont = document.getElementById('ui-notifications-list'); listCont.innerHTML = '';
    try { const notiQuery = query(collection(db, "users", uid, "notifications"), orderBy("timestamp", "desc")); const notiSnap = await getDocs(notiQuery);
        if(!notiSnap.empty) { document.getElementById('noti-badge-dot').style.display = 'block'; notiSnap.forEach(doc => { let d = doc.data(); let imgHtml = d.imageUrl ? `<div class="n-img-box" style="background-image:url('${d.imageUrl}'); display:block;"></div>` : ''; listCont.innerHTML += `<div class="u-box" style="flex-direction:column; align-items:flex-start; cursor:default;"><div style="display:flex; width:100%; justify-content:space-between; align-items:center; border-bottom:1px solid #444; padding-bottom:6px; margin-bottom:6px;"><h4 style="color:#00ffcc; font-size:14px; margin:0;"><i class="fa-solid fa-bell"></i> ${d.title}</h4><span style="font-size:9px; color:#888;">${d.time}</span></div>${imgHtml}<p style="font-size:11px; color:#fff; line-height:1.5; font-weight:normal;">${d.message}</p></div>`; }); } else { listCont.innerHTML = '<p style="text-align:center; padding: 20px; color:#888; font-size:12px;">No notifications yet.</p>'; } } catch(e) { console.log("Error fetching notifications:", e); }
}

window.openFullPost = function(index) { const data = globalUpdatesData[index]; if(!data) return; document.getElementById('ui-upd-img').style.backgroundImage = `url('${data.imgUrl || ""}')`; document.getElementById('ui-upd-title').innerText = data.title; document.getElementById('ui-upd-time').innerText = data.time; document.getElementById('ui-upd-desc').innerText = data.description; pushHistoryState('updates-post'); hideAllSections(); document.getElementById('updates-post-section').style.display = 'block'; resetAppScroll(); }

window.copyText = function(id) { navigator.clipboard.writeText(document.getElementById(id).innerText).then(() => { alert("Copied: " + document.getElementById(id).innerText); }); }

// ADD MONEY GATEWAY INITIALIZATION FLOW
window.startRechargeFlow = function(isBack = false) {
    if(!isBack) { pushHistoryState('addmoney'); }
    hideAllSections(); 
    document.getElementById('addmoney-section').style.display = 'block'; 
    resetAppScroll();
    document.getElementById('am-amount').value = ''; 
}

// REAL GATEWAY DEPOSIT ACTION TO BACKEND SERVER (ON RENDER)
window.initiateGatewayPayment = async function() {
    const amtInput = document.getElementById('am-amount');
    const amt = parseFloat(amtInput.value);
    
    if (isNaN(amt) || amt < addMoneySettings.min || amt > addMoneySettings.max) {
        alert(`Please enter a deposit amount between ₹${addMoneySettings.min} and ₹${addMoneySettings.max}`);
        return;
    }
    
    if (!auth.currentUser || !currentUserDoc) {
        alert("Session expired. Please login again to continue.");
        return;
    }

    showLoader(true, "Redirecting to Secure Payment...");
    try {
        let cleanPhone = currentUserDoc.phone || '9999999999';
        cleanPhone = cleanPhone.replace("+91", "").replace(/\s+/g, "").trim();

        const response = await fetch("https://payment-gateway-1i9b.onrender.com/create-payment", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                amount: amt,
                userId: auth.currentUser.uid,
                userEmail: currentUserDoc.email,
                userPhone: cleanPhone,
                userName: `${currentUserDoc.firstName || 'User'} ${currentUserDoc.lastName || ''}`.trim()
            })
        });

        const resData = await response.json();
        showLoader(false);

        if (resData && resData.success && resData.payment_url) {
            window.location.href = resData.payment_url;
        } else {
            alert("Payment Request Rejected: " + (resData.message || "Unknown Provider Error"));
        }
    } catch (e) {
        showLoader(false);
        console.error("Payment initiation failure: ", e);
        alert("Payment gateway is temporarily busy. Please try again.");
    }
}

window.openWithdrawalSection = function(isBack = false) {
    if(!isBack) { pushHistoryState('withdraw'); } document.getElementById('wm-amt').value = ''; document.getElementById('wm-upi').value = ''; hideAllSections(); document.getElementById('withdrawal-section').style.display = 'block'; resetAppScroll();
}

window.submitWithdrawal = async function() {
    const amt = parseFloat(document.getElementById('wm-amt').value); const upi = document.getElementById('wm-upi').value.trim(); const btn = document.getElementById('wm-submit-btn');
    if(isNaN(amt) || amt < minWithdrawLimit) { alert(`Minimum withdrawal is ₹${minWithdrawLimit}`); return; }
    if(!upi) { alert("Enter UPI ID or Bank Details."); return; }
    let winBal = parseFloat(currentUserDoc.winningCash || 0); if(amt > winBal) { alert("Insufficient Winning Balance."); return; }
    btn.innerHTML = "Processing..."; btn.disabled = true; showLoader(true);
    try {
        let curBal = parseFloat(currentUserDoc.balance || 0);
        await updateDoc(doc(db, "users", auth.currentUser.uid), { winningCash: winBal - amt, balance: curBal - amt });
        await addDoc(collection(db, "withdrawals"), { userId: auth.currentUser.uid, userEmail: currentUserDoc.email, amount: amt, upiId: upi, status: 'pending', timestamp: new Date().getTime() });
        document.getElementById('success-msg').innerText = "Withdrawal request submitted successfully!"; showSuccessPopup(); fireCanvasConfetti();
        setTimeout(() => { showWallet(); }, 3000);
    } catch(e) { alert("Error: " + e.message); }
    btn.innerHTML = "Send Request"; btn.disabled = false; showLoader(false);
}

function showSuccessPopup() { const pop = document.getElementById('success-popup'); pop.style.display = 'block'; setTimeout(() => { pop.classList.add('show'); }, 10); setTimeout(() => { pop.classList.remove('show'); setTimeout(() => { pop.style.display = 'none'; }, 300); }, 3000); }
// ==================== SUPABASE CLIENT INIT ====================
const supabaseUrl = "https://oktdmqfgqmhipbpbtnbl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdGRtcWZncW1oaXBicGJ0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTcxNjEsImV4cCI6MjA4OTEzMzE2MX0.Bi6cyYtGxiaMiW7Iv-3lSpXselY8kj4DLBZwch1AJws";

window.supabase = supabase.createClient(supabaseUrl, supabaseKey);
console.log("✅ Supabase initialized");

// ==================== GLOBAL VARIABLES ====================
let currentUserId = null;
let currentUserName = "Guest";
let isAdmin = false;
let activeImageList = [];
let currentSlideIndex = 0;
let selectedFiles = [];
let allPosts = [];
let lastVisiblePost = null;
let isFetching = false;
let isFirstLoadDone = false;
let virtualPaddingTop = 0;
let removedPostsCount = 0;
let reactionQueue = [];
let commentQueue = [];
let shareQueue = [];
let notifQueue = [];
let viewQueue = {};

// ==================== HELPER FUNCTIONS ====================
function escapeHtml(text) {
    if (text == null) return '';
    const str = String(text);
    if (str.length === 0) return '';
    const htmlEntities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    };
    return str.replace(/[&<>"'/`=]/g, match => htmlEntities[match]);
}

function showToastMessage(message, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            z-index: 10000; display: flex; flex-direction: column;
            align-items: center; width: 100%; pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
    }
    const colors = { success: '#2ecc71', error: '#e74c3c', info: '#3498db', warning: '#f1c40f' };
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${colors[type] || colors.info}; color: white; padding: 10px 20px;
        border-radius: 25px; margin-bottom: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        font-size: 14px; text-align: center; min-width: 200px; max-width: 85%;
        opacity: 0; transform: translateY(-10px); transition: all 0.3s ease;
    `;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }, 10);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { if (toastContainer.contains(toast)) toastContainer.removeChild(toast); }, 300);
    }, 2500);
}

function formatTime(timestamp) {
    if (!timestamp) return "";
    let date = new Date(timestamp);
    if (isNaN(date.getTime())) return "";
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return "ခုနကတင်";
    if (diff < 3600) return Math.floor(diff / 60) + " မိနစ်ခန့်က";
    if (diff < 86400) return Math.floor(diff / 3600) + " နာရီခန့်က";
    if (diff < 172800) return "မနေ့က";
    return date.toLocaleDateString('my-MM', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getFormattedDisplayName(userData) {
    if (!userData) return "Unknown User";
    const name = userData.display_name || userData.author || userData.name || "User";
    const isCrown = userData.is_crown || userData.isCrown || false;
    const isGold = userData.is_gold || userData.isGold || false;
    let badges = '';
    if (isCrown) badges += '<span class="badge-official crown-bg" style="margin-left:5px;">👑 Official</span>';
    if (isGold) badges += '<span class="badge-official gold-bg" style="margin-left:5px;">💰 Verified</span>';
    return `${escapeHtml(name)} ${badges}`;
}

// ==================== AUTH & USER SETUP ====================
async function getDeviceId() {
    if (typeof FingerprintJS === 'undefined') {
        let id = localStorage.getItem("device_id");
        if (!id) { id = "dev_" + Math.random().toString(36).substring(2, 10); localStorage.setItem("device_id", id); }
        return id;
    }
    try {
        if (!window.fpAgent) window.fpAgent = await FingerprintJS.load();
        const result = await window.fpAgent.get();
        return result.visitorId;
    } catch (e) { return generateFallbackId(); }
}

function generateFallbackId() {
    let id = localStorage.getItem("device_id");
    if (!id) { id = "dev_" + Math.random().toString(36).substring(2, 10); localStorage.setItem("device_id", id); }
    return id;
}

async function getOrCreateUser() {
    try {
        const savedUserId = localStorage.getItem('emotion_user_id');
        const savedName = localStorage.getItem('emotion_user_name');
        if (savedUserId && savedName) {
            currentUserId = savedUserId;
            currentUserName = savedName;
            updateUIForUser();
            return;
        }
        const deviceId = await getDeviceId();
        const { data: existingUser, error } = await window.supabase
            .from('profiles')
            .select('id, name, is_admin, has_badge')
            .eq('device_id', deviceId)
            .maybeSingle();
        if (existingUser && !error) {
            currentUserId = existingUser.id;
            currentUserName = existingUser.name;
            isAdmin = existingUser.is_admin || false;
            localStorage.setItem('emotion_user_id', currentUserId);
            localStorage.setItem('emotion_user_name', currentUserName);
            updateUIForUser();
        } else {
            document.getElementById('nameSetupModal').style.display = 'flex';
        }
    } catch (err) {
        console.error("Auth error:", err);
        showToastMessage("Network error, please refresh.");
    }
}

function updateUIForUser() {
    const displaySpan = document.getElementById('userNameDisplay');
    if (displaySpan) displaySpan.innerText = currentUserName;
    const adminBadge = document.getElementById('adminBadge');
    if (adminBadge) adminBadge.style.display = isAdmin ? 'inline-block' : 'none';
}

async function saveInitialName() {
    const nameInput = document.getElementById('setupUserName');
    const userName = nameInput.value.trim();
    if (!userName) { alert("ကျေးဇူးပြု၍ အမည်ထည့်ပါ။"); return; }
    try {
        const deviceId = await getDeviceId();
        const { data: newUser, error } = await window.supabase
            .from('profiles')
            .insert([{ name: userName, device_id: deviceId, is_admin: false, has_badge: false }])
            .select().single();
        if (error) throw error;
        currentUserId = newUser.id;
        currentUserName = userName;
        localStorage.setItem('emotion_user_id', currentUserId);
        localStorage.setItem('emotion_user_name', currentUserName);
        document.getElementById('nameSetupModal').style.display = 'none';
        updateUIForUser();
        loadPosts();
        showToastMessage("Welcome " + userName + "!");
    } catch (err) { console.error(err); alert("Error saving name. Please try again."); }
}

async function loginWithGoogle() {
    try {
        const { error } = await window.supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
        if (error) throw error;
    } catch (err) { console.error(err); alert("Google login failed"); }
}

function showPhoneLogin() { document.getElementById('phoneLoginModal').style.display = 'flex'; }
function closePhoneLogin() { document.getElementById('phoneLoginModal').style.display = 'none'; }

// ==================== POST FUNCTIONS ====================
function previewMedia(input) {
    const previewBox = document.getElementById('mediaPreviewBox');
    previewBox.innerHTML = '';
    selectedFiles = Array.from(input.files);
    if (selectedFiles.length === 0) { previewBox.style.display = 'none'; return; }
    previewBox.style.display = 'block';
    selectedFiles.forEach((file, idx) => {
        const url = URL.createObjectURL(file);
        const isVideo = file.type.startsWith('video/');
        const container = document.createElement('div');
        container.style.position = 'relative';
        container.style.marginBottom = '8px';
        if (isVideo) {
            const video = document.createElement('video');
            video.src = url;
            video.controls = true;
            video.style.width = '100%';
            video.style.borderRadius = '8px';
            container.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = url;
            img.style.width = '100%';
            img.style.borderRadius = '8px';
            container.appendChild(img);
        }
        const removeBtn = document.createElement('button');
        removeBtn.innerText = '✖';
        removeBtn.style.position = 'absolute';
        removeBtn.style.right = '8px';
        removeBtn.style.top = '8px';
        removeBtn.style.backgroundColor = 'rgba(0,0,0,0.6)';
        removeBtn.style.color = 'white';
        removeBtn.style.border = 'none';
        removeBtn.style.borderRadius = '50%';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.width = '28px';
        removeBtn.style.height = '28px';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            selectedFiles.splice(idx, 1);
            const inputEl = document.getElementById('mediaInput');
            const dt = new DataTransfer();
            selectedFiles.forEach(f => dt.items.add(f));
            inputEl.files = dt.files;
            previewMedia(inputEl);
            if (selectedFiles.length === 0) previewBox.style.display = 'none';
        };
        container.appendChild(removeBtn);
        previewBox.appendChild(container);
    });
}

function clearPreview() {
    const box = document.getElementById('mediaPreviewBox');
    const input = document.getElementById('mediaInput');
    if (box) { box.innerHTML = ''; box.style.display = 'none'; }
    if (input) input.value = '';
    selectedFiles = [];
}

async function uploadAndPost() {
    const content = document.getElementById('postContent').value.trim();
    if (!content && selectedFiles.length === 0) { alert("ပို့စ်အတွက် စာသား (သို့) မီဒီယာ ထည့်ပါ။"); return; }
    if (!currentUserId) { alert("ကျေးဇူးပြု၍ Login ဝင်ပါ။"); return; }
    const btn = document.getElementById('btnPost');
    btn.innerText = "တင်နေသည်...";
    btn.disabled = true;
    try {
        let mediaUrls = [];
        if (selectedFiles.length > 0) {
            const formData = new FormData();
            selectedFiles.forEach(file => formData.append('file', file));
            formData.append('userId', currentUserId);
            const response = await fetch('/api/upload', { method: 'POST', body: formData });
            const result = await response.json();
            if (result.success && result.urls) mediaUrls = result.urls;
            else throw new Error(result.error || "Upload failed");
        }
        const { error: postError } = await window.supabase
            .from('posts')
            .insert([{ user_id: currentUserId, content: content, media_urls: mediaUrls, created_at: new Date().toISOString() }]);
        if (postError) throw postError;
        document.getElementById('postContent').value = '';
        document.getElementById('mediaInput').value = '';
        document.getElementById('mediaPreviewBox').innerHTML = '';
        document.getElementById('mediaPreviewBox').style.display = 'none';
        selectedFiles = [];
        loadPosts();
        showToastMessage("ပို့စ်တင်ခြင်း အောင်မြင်ပါသည်!");
    } catch (err) { console.error(err); alert("ပို့စ်တင်ရာတွင် အမှားရှိသည်: " + err.message); }
    finally { btn.innerText = "တင်မည်"; btn.disabled = false; }
}

// ==================== LOAD POSTS ====================
async function loadPosts() {
    const feedDiv = document.getElementById('newsFeed');
    feedDiv.innerHTML = '<div class="loading-status">⏳ ပို့စ်များကို ရှာဖွေနေပါသည်...</div>';
    try {
        const { data: posts, error } = await window.supabase
            .from('posts')
            .select(`*, profiles:user_id (name, is_admin, display_name, is_crown, is_gold)`)
            .order('created_at', { ascending: false });
        if (error) throw error;
        if (!posts || posts.length === 0) { feedDiv.innerHTML = '<div class="loading-status">📭 ပို့စ်မရှိသေးပါ။ အခုပင် တင်လိုက်ပါ။</div>'; return; }
        feedDiv.innerHTML = '';
        for (const post of posts) { feedDiv.appendChild(createPostCard(post)); }
    } catch (err) { console.error(err); feedDiv.innerHTML = '<div class="loading-status">❌ ပို့စ်များ ရယူရာတွင် အမှားရှိသည်။</div>'; }
}

function createPostCard(post) {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.style.margin = '12px auto';
    const profile = post.profiles || {};
    const userName = profile.display_name || profile.name || "Anonymous";
    const isPostAdmin = profile.is_admin || false;
    const timestamp = formatTime(post.created_at);
    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.marginBottom = '8px';
    const leftDiv = document.createElement('div');
    leftDiv.style.display = 'flex';
    leftDiv.style.alignItems = 'center';
    leftDiv.style.gap = '8px';
    const nameSpan = document.createElement('strong');
    nameSpan.innerHTML = getFormattedDisplayName({ display_name: userName, is_crown: profile.is_crown, is_gold: profile.is_gold });
    const timeSpan = document.createElement('small');
    timeSpan.innerText = timestamp;
    timeSpan.style.color = 'gray';
    timeSpan.style.fontSize = '11px';
    leftDiv.appendChild(nameSpan);
    leftDiv.appendChild(timeSpan);
    headerDiv.appendChild(leftDiv);
    if (isAdmin) {
        const adminBtns = document.createElement('div');
        adminBtns.innerHTML = `<button onclick="deletePost('${post.id}')" style="background:none; border:none; cursor:pointer;">🗑️</button>`;
        headerDiv.appendChild(adminBtns);
    }
    const contentDiv = document.createElement('div');
    contentDiv.className = 'post-text';
    contentDiv.innerText = post.content || '';
    contentDiv.style.marginBottom = '10px';
    card.appendChild(headerDiv);
    card.appendChild(contentDiv);
    if (post.media_urls && post.media_urls.length > 0) {
        const mediaContainer = document.createElement('div');
        mediaContainer.className = 'post-media-container';
        if (post.media_urls.length === 1) {
            const url = post.media_urls[0];
            const isVideo = url.match(/\.(mp4|webm|mov)$/i) || url.includes('.mp4');
            if (isVideo) {
                const video = document.createElement('video');
                video.src = url;
                video.controls = true;
                video.style.width = '100%';
                video.style.maxHeight = '450px';
                mediaContainer.appendChild(video);
            } else {
                const img = document.createElement('img');
                img.src = url;
                img.style.width = '100%';
                img.style.cursor = 'pointer';
                img.onclick = () => openPhotoViewer(post.media_urls, 0);
                mediaContainer.appendChild(img);
            }
        } else {
            const grid = document.createElement('div');
            grid.className = 'photo-grid';
            const total = post.media_urls.length;
            if (total === 2) grid.classList.add('grid-2');
            else if (total === 3) grid.classList.add('grid-3');
            else grid.classList.add('grid-4');
            const displayCount = Math.min(total, 4);
            for (let i = 0; i < displayCount; i++) {
                const item = document.createElement('div');
                item.className = 'grid-item';
                const img = document.createElement('img');
                img.src = post.media_urls[i];
                img.alt = 'post image';
                img.onclick = () => openPhotoViewer(post.media_urls, i);
                item.appendChild(img);
                if (i === 3 && total > 4) {
                    const overlay = document.createElement('div');
                    overlay.className = 'more-overlay';
                    overlay.innerText = `+${total - 4}`;
                    item.appendChild(overlay);
                }
                grid.appendChild(item);
            }
            mediaContainer.appendChild(grid);
        }
        card.appendChild(mediaContainer);
    }
    const actionDiv = document.createElement('div');
    actionDiv.style.display = 'flex';
    actionDiv.style.gap = '15px';
    actionDiv.style.marginTop = '10px';
    actionDiv.style.paddingTop = '8px';
    actionDiv.style.borderTop = '1px solid #eee';
    const likeBtn = document.createElement('button');
    likeBtn.innerText = '❤️ Like';
    likeBtn.style.background = 'none';
    likeBtn.style.border = 'none';
    likeBtn.style.cursor = 'pointer';
    likeBtn.onclick = () => showToastMessage("Like feature coming soon");
    const commentBtn = document.createElement('button');
    commentBtn.innerText = '💬 Comment';
    commentBtn.style.background = 'none';
    commentBtn.style.border = 'none';
    commentBtn.style.cursor = 'pointer';
    commentBtn.onclick = () => showToastMessage("Comment feature coming soon");
    actionDiv.appendChild(likeBtn);
    actionDiv.appendChild(commentBtn);
    card.appendChild(actionDiv);
    return card;
}

// ==================== PHOTO VIEWER ====================
function openPhotoViewer(imageList, startIndex) {
    activeImageList = imageList;
    currentSlideIndex = startIndex;
    const viewer = document.getElementById('photoViewer');
    const imgEl = document.getElementById('activeImg');
    const countSpan = document.getElementById('photoCount');
    if (imgEl) imgEl.src = activeImageList[currentSlideIndex];
    if (countSpan) countSpan.innerText = `${currentSlideIndex+1} / ${activeImageList.length}`;
    if (viewer) viewer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closePhotoViewer() {
    document.getElementById('photoViewer').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function changeSlide(direction) {
    if (!activeImageList.length) return;
    currentSlideIndex += direction;
    if (currentSlideIndex < 0) currentSlideIndex = activeImageList.length - 1;
    if (currentSlideIndex >= activeImageList.length) currentSlideIndex = 0;
    const imgEl = document.getElementById('activeImg');
    const countSpan = document.getElementById('photoCount');
    if (imgEl) imgEl.src = activeImageList[currentSlideIndex];
    if (countSpan) countSpan.innerText = `${currentSlideIndex+1} / ${activeImageList.length}`;
}

// ==================== DELETE POST ====================
async function deletePost(id) {
    if (!confirm("ဖျက်မှာလား?")) return;
    try {
        const { error } = await window.supabase.from('posts').delete().eq('id', id);
        if (error) throw error;
        showToastMessage("ပို့စ်ဖျက်ပြီးပါပြီ");
        loadPosts();
    } catch (err) { console.error(err); alert("ဖျက်လို့မရပါဘူး: " + err.message); }
}

// ==================== INIT ====================
async function init() {
    await getOrCreateUser();
    loadPosts();
}

// Start the app
init();

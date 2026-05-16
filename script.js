const supabaseUrl = "https://oktdmqfgqmhipbpbtnbl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdGRtcWZncW1oaXBicGJ0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTcxNjEsImV4cCI6MjA4OTEzMzE2MX0.Bi6cyYtGxiaMiW7Iv-3lSpXselY8kj4DLBZwch1AJws";

window.supabase = supabase.createClient(supabaseUrl, supabaseKey);
console.log("✅ Supabase initialized");

let currentUserId = null;
let currentUserName = "Guest";
let isAdmin = false;
let activeImageList = [];
let currentSlideIndex = 0;
let selectedFiles = [];

function escapeHtml(text) {
    if (text == null) return '';
    const str = String(text);
    const htmlEntities = {
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
        "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
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

function generateFallbackId() {
    let id = localStorage.getItem("device_id");
    if (!id) { 
        id = "dev_" + Math.random().toString(36).substring(2, 10); 
        localStorage.setItem("device_id", id); 
    }
    return id;
}

async function getDeviceId() {
    if (typeof FingerprintJS === 'undefined') {
        return generateFallbackId();
    }
    try {
        if (!window.fpAgent) window.fpAgent = await FingerprintJS.load();
        const result = await window.fpAgent.get();
        return result.visitorId;
    } catch (e) { 
        return generateFallbackId();
    }
}

async function getOrCreateUser() {
    try {
        const savedUserId = localStorage.getItem('emotion_user_id');
        const savedName = localStorage.getItem('emotion_user_name');
        if (savedUserId && savedName) {
            currentUserId = savedUserId;
            currentUserName = savedName;
            
            const { data: prof } = await window.supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', currentUserId)
                .maybeSingle();
            if (prof) isAdmin = prof.is_admin || false;

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
            currentUserName = existingUser.name || "User";
            isAdmin = existingUser.is_admin || false;
            localStorage.setItem('emotion_user_id', currentUserId);
            localStorage.setItem('emotion_user_name', currentUserName);
            updateUIForUser();
            loadPosts();
        } else {
            const modal = document.getElementById('nameSetupModal');
            if (modal) modal.style.display = 'flex';
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
    
    if (!userName) {
        alert("ကျေးဇူးပြု၍ အမည်ထည့်ပါ။");
        return;
    }
    
    if (userName.length < 2) {
        alert("အမည်သည် အနည်းဆုံး ၂ လုံးရှိရပါမည်။");
        return;
    }
    
    const btn = document.querySelector('#nameSetupModal button');
    const originalText = btn ? btn.innerText : "အတည်ပြုမည်";
    if (btn) {
        btn.disabled = true;
        btn.innerText = "စစ်ဆေးနေသည်...";
    }
    
    try {
        const deviceId = await getDeviceId();
        
        const { data: existing, error: checkError } = await window.supabase
            .from('profiles')
            .select('id')
            .eq('device_id', deviceId)
            .maybeSingle();
        
        let userId;
        
        if (existing) {
            userId = existing.id;
            const { error: updateError } = await window.supabase
                .from('profiles')
                .update({ name: userName, display_name: userName })
                .eq('id', userId);
            
            if (updateError) throw updateError;
        } else {
            const { data: newUser, error: insertError } = await window.supabase
                .from('profiles')
                .insert([{ 
                    name: userName, 
                    display_name: userName,
                    device_id: deviceId, 
                    is_admin: false, 
                    has_badge: false 
                }])
                .select()
                .single();
                
            if (insertError) throw insertError;
            userId = newUser.id;
        }
        
        currentUserId = userId;
        currentUserName = userName;
        localStorage.setItem('emotion_user_id', currentUserId);
        localStorage.setItem('emotion_user_name', currentUserName);
        
        const modal = document.getElementById('nameSetupModal');
        if (modal) modal.style.display = 'none';
        
        updateUIForUser();
        loadPosts();
        showToastMessage("Welcome " + userName + "!");
        
    } catch (err) { 
        console.error("Save name error:", err);
        alert("Error saving name: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    }
}

async function loginWithGoogle() {
    try {
        const { error } = await window.supabase.auth.signInWithOAuth({ 
            provider: 'google', 
            options: { redirectTo: window.location.origin } 
        });
        if (error) throw error;
    } catch (err) { 
        console.error(err); 
        alert("Google login failed"); 
    }
}

function showPhoneLogin() { 
    document.getElementById('phoneLoginModal').style.display = 'flex'; 
}

function closePhoneLogin() { 
    document.getElementById('phoneLoginModal').style.display = 'none'; 
}

async function sendOTP() {
    const phone = "+959" + document.getElementById('phoneNumber').value.trim();
    try {
        const { error } = await window.supabase.auth.signInWithOtp({ phone });
        if (error) throw error;
        document.getElementById('otpSection').style.display = 'block';
        showToastMessage("OTP ပို့ပြီးပါပြီ");
    } catch (error) { 
        showToastMessage("Error: " + error.message); 
    }
}

async function verifyOTP() {
    const phone = "+959" + document.getElementById('phoneNumber').value.trim();
    const token = document.getElementById('otpCode').value.trim();
    try {
        const { error } = await window.supabase.auth.verifyOtp({ phone, token, type: 'sms' });
        if (error) throw error;
        closePhoneLogin();
        showToastMessage("Login အောင်မြင်ပါတယ်");
        location.reload();
    } catch (error) { 
        alert("OTP မှားနေပါတယ်"); 
    }
}

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
    if (box) { 
        box.innerHTML = ''; 
        box.style.display = 'none'; 
    }
    if (input) input.value = '';
    selectedFiles = [];
}

async function uploadAndPost() {
    const content = document.getElementById('postContent').value.trim();
    if (!content && selectedFiles.length === 0) { 
        alert("ပို့စ်အတွက် စာသား (သို့) မီဒီယာ ထည့်ပါ။"); 
        return; 
    }
    if (!currentUserId) { 
        alert("ကျေးဇူးပြု၍ Login ဝင်ပါ။"); 
        return; 
    }
    
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
            if (result.success && result.urls) {
                mediaUrls = result.urls;
            } else {
                throw new Error(result.error || "Upload failed");
            }
        }
        
        const { error: postError } = await window.supabase
            .from('posts')
            .insert([{ 
                user_id: currentUserId, 
                content: content, 
                media_urls: mediaUrls, 
                created_at: new Date().toISOString() 
            }]);
            
        if (postError) throw postError;
        
        document.getElementById('postContent').value = '';
        document.getElementById('mediaInput').value = '';
        document.getElementById('mediaPreviewBox').innerHTML = '';
        document.getElementById('mediaPreviewBox').style.display = 'none';
        selectedFiles = [];
        loadPosts();
        showToastMessage("ပို့စ်တင်ခြင်း အောင်မြင်ပါသည်!");
    } catch (err) { 
        console.error(err); 
        alert("ပို့စ်တင်ရာတွင် အမှားရှိသည်: " + err.message); 
    }
    finally { 
        btn.innerText = "တင်မည်"; 
        btn.disabled = false; 
    }
}

async function loadPosts() {
    const feedDiv = document.getElementById('newsFeed');
    if (!feedDiv) return;
    feedDiv.innerHTML = '<div class="loading-status">⏳ ပို့စ်များကို ရှာဖွေနေပါသည်...</div>';
    
    try {
        const { data: posts, error } = await window.supabase
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        if (!posts || posts.length === 0) { 
            feedDiv.innerHTML = '<div class="loading-status">📭 ပို့စ်မရှိသေးပါ။ အခုပင် တင်လိုက်ပါ။</div>'; 
            return; 
        }
        
        const userIds = [...new Set(posts.map(p => p.user_id).filter(id => id))];
        
        let profilesMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await window.supabase
                .from('profiles')
                .select('id, name, display_name, is_admin')
                .in('id', userIds);
            
            if (profiles) {
                profilesMap = Object.fromEntries(profiles.map(p => [p.id, p]));
            }
        }
        
        feedDiv.innerHTML = '';
        for (const post of posts) { 
            const profile = profilesMap[post.user_id] || {};
            feedDiv.appendChild(createPostCard(post, profile)); 
        }
    } catch (err) { 
        console.error(err); 
        feedDiv.innerHTML = '<div class="loading-status">❌ ပို့စ်များ ရယူရာတွင် အမှားရှိသည်။</div>'; 
    }
}

function createPostCard(post, profile = {}) {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.style.margin = '12px auto';
    card.style.background = 'white';
    card.style.borderRadius = '12px';
    card.style.padding = '15px';
    card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    
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
    nameSpan.innerText = escapeHtml(userName);
    nameSpan.style.color = 'purple';
    
    if (isPostAdmin) {
        const adminBadgeSpan = document.createElement('span');
        adminBadgeSpan.innerText = "ADMIN";
        adminBadgeSpan.style.background = 'red';
        adminBadgeSpan.style.color = 'white';
        adminBadgeSpan.style.fontSize = '10px';
        adminBadgeSpan.style.padding = '2px 6px';
        adminBadgeSpan.style.borderRadius = '12px';
        adminBadgeSpan.style.marginLeft = '5px';
        nameSpan.appendChild(adminBadgeSpan);
    }
    
    const timeSpan = document.createElement('small');
    timeSpan.innerText = timestamp;
    timeSpan.style.color = 'gray';
    timeSpan.style.fontSize = '11px';
    
    leftDiv.appendChild(nameSpan);
    leftDiv.appendChild(timeSpan);
    headerDiv.appendChild(leftDiv);
    
    if (window.isAdmin || (typeof isAdmin !== 'undefined' && isAdmin)) {
        const adminBtns = document.createElement('div');
        const deleteBtn = document.createElement('button');
        deleteBtn.innerText = '🗑️';
        deleteBtn.style.background = 'none';
        deleteBtn.style.border = 'none';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.fontSize = '16px';
        deleteBtn.onclick = () => deletePost(post.id);
        adminBtns.appendChild(deleteBtn);
        headerDiv.appendChild(adminBtns);
    }
    
    card.appendChild(headerDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'post-text';
    contentDiv.innerText = post.content || '';
    contentDiv.style.marginBottom = '10px';
    contentDiv.style.whiteSpace = 'pre-wrap';
    contentDiv.style.wordBreak = 'break-word';
    contentDiv.style.fontSize = '14px';
    contentDiv.style.lineHeight = '1.5';
    
    card.appendChild(contentDiv);
    
    const checkIsVideo = (url) => {
        return url.match(/\.(mp4|webm|mov|m4v|3gp)$/i) || 
               url.includes('.mp4') || 
               url.includes('bunny') || 
               url.includes('storage.bunnycdn');
    };

    if (post.media_urls && post.media_urls.length > 0) {
        const mediaContainer = document.createElement('div');
        mediaContainer.style.marginTop = '10px';
        
        if (post.media_urls.length === 1) {
            const url = post.media_urls[0];
            

            if (checkIsVideo(url)) {

    const video = document.createElement('video');

    video.src = url;
    video.controls = true;
    video.preload = "metadata";

    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    video.style.width = '100%';
    video.style.maxHeight = '650px';
    video.style.borderRadius = '8px';
    video.style.background = '#000';

    video.onerror = function(e) {

        console.error("VIDEO ERROR:", e);
        console.log("FAILED URL:", url);

        const err = document.createElement('div');
        err.style.color = 'red';
        err.style.padding = '10px';
        err.innerText = '❌ Video load failed';

        mediaContainer.appendChild(err);
    };

    mediaContainer.appendChild(video);
}else {
                const img = document.createElement('img');
                img.src = url;
                img.style.width = '100%';
                img.style.borderRadius = '8px';
                img.style.cursor = 'pointer';
                img.onclick = () => openPhotoViewer(post.media_urls, 0);
                mediaContainer.appendChild(img);
            }
        } 
        else {
            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gap = '4px';
            const total = post.media_urls.length;
            
            if (total === 2) grid.style.gridTemplateColumns = '1fr 1fr';
            else if (total === 3) grid.style.gridTemplateColumns = '2fr 1fr';
            else grid.style.gridTemplateColumns = '1fr 1fr';
            grid.style.height = '250px';
            
            const displayCount = Math.min(total, 4);
            for (let i = 0; i < displayCount; i++) {
                const url = post.media_urls[i];
                const item = document.createElement('div');
                item.style.position = 'relative';
                item.style.cursor = 'pointer';
                item.style.overflow = 'hidden';
                item.style.background = '#000';
                item.style.borderRadius = '4px';
                
                if (checkIsVideo(url)) {
                    const videoPreview = document.createElement('video');
                    videoPreview.src = url;
                    videoPreview.muted = true;
                    videoPreview.preload = "metadata";
                    videoPreview.style.width = '100%';
                    videoPreview.style.height = '100%';
                    videoPreview.style.objectFit = 'cover';
                    item.appendChild(videoPreview);
                    
                    const playOverlay = document.createElement('div');
                    playOverlay.innerText = '▶';
                    playOverlay.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:white; font-size:24px; background:rgba(0,0,0,0.5); width:40px; height:40px; display:flex; align-items:center; justify-content:center; border-radius:50%; pointer-events:none;';
                    item.appendChild(playOverlay);
                    
                    item.onclick = () => {
                        if (videoPreview.paused) videoPreview.play();
                        else videoPreview.pause();
                    };
                } else {
                    const img = document.createElement('img');
                    img.src = url;
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'cover';
                    img.onclick = () => openPhotoViewer(post.media_urls, i);
                    item.appendChild(img);
                }
                
                if (i === 3 && total > 4) {
                    const overlay = document.createElement('div');
                    overlay.innerText = `+${total - 4}`;
                    overlay.style.position = 'absolute';
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.width = '100%';
                    overlay.style.height = '100%';
                    overlay.style.background = 'rgba(0,0,0,0.6)';
                    overlay.style.color = 'white';
                    overlay.style.display = 'flex';
                    overlay.style.alignItems = 'center';
                    overlay.style.justifyContent = 'center';
                    overlay.style.fontSize = '24px';
                    overlay.style.fontWeight = 'bold';
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
    likeBtn.style.padding = '5px 10px';
    likeBtn.onclick = () => showToastMessage("Like feature coming soon");
    
    const commentBtn = document.createElement('button');
    commentBtn.innerText = '💬 Comment';
    commentBtn.style.background = 'none';
    commentBtn.style.border = 'none';
    commentBtn.style.cursor = 'pointer';
    commentBtn.style.padding = '5px 10px';
    commentBtn.onclick = () => showToastMessage("Comment feature coming soon");
    
    actionDiv.appendChild(likeBtn);
    actionDiv.appendChild(commentBtn);
    card.appendChild(actionDiv);
    
    return card;
}

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

async function deletePost(id) {
    if (!confirm("ဖျက်မှာလား?")) return;
    try {
        const { error } = await window.supabase.from('posts').delete().eq('id', id);
        if (error) throw error;
        showToastMessage("ပို့စ်ဖျက်ပြီးပါပြီ");
        loadPosts();
    } catch (err) { 
        console.error(err); 
        alert("ဖျက်လို့မရပါဘူး: " + err.message); 
    }
}

window.previewMedia = previewMedia;
window.uploadAndPost = uploadAndPost;
window.saveInitialName = saveInitialName;
window.loginWithGoogle = loginWithGoogle;
window.showPhoneLogin = showPhoneLogin;
window.closePhoneLogin = closePhoneLogin;
window.sendOTP = sendOTP;
window.verifyOTP = verifyOTP;
window.deletePost = deletePost;
window.openPhotoViewer = openPhotoViewer;
window.closePhotoViewer = closePhotoViewer;
window.changeSlide = changeSlide;
window.showToastMessage = showToastMessage;

async function init() {
    await getOrCreateUser();
    loadPosts();
}
init();

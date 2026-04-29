window.supabaseUrl = null;
window.supabaseKey = null;
window.supabaseClient = null; // Client အတွက် သီးသန့်ထားပါ

let supabaseReadyResolver;
const supabaseReady = new Promise((resolve) => {
    supabaseReadyResolver = resolve;
});

async function loadConfig() {
    try {
        // Local မှာ စမ်းနေတာဆိုရင် path မှန်မမှန် စစ်ပါ
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const config = await response.json();
        
        window.supabaseUrl = config.SUPABASE_URL;
        window.supabaseKey = config.SUPABASE_ANON_KEY;

        console.log("✅ Config loaded");
        initSupabase(); // Config ရမှ ဒါကို ခေါ်ပါ
        
    } catch (error) {
        console.error("❌ Config Load Error:", error);
    }
}

async function initSupabase() {
    let attempts = 0;
    const maxAttempts = 50; 

    const checkInterval = setInterval(() => {
        if (typeof supabase !== 'undefined' && window.supabaseUrl && window.supabaseKey) {
            clearInterval(checkInterval);
            
            try {
                if (!window.supabaseClient) {
                    window.supabaseClient = supabase.createClient(window.supabaseUrl, window.supabaseKey);
                }
                
                console.log("✅ Supabase Client is ready!");
                supabaseReadyResolver(window.supabaseClient); 
                
                if (typeof initApp === 'function') initApp();

            } catch (err) {
                console.error("❌ Client Creation Error:", err);
            }
            
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.error("❌ Supabase library missing or Config not ready");
        }
        attempts++;
    }, 100);
}

//loadConfig();
let authListener = null; 

function checkIsAdmin(user) {
    return (
        user?.email === window.ADMIN_EMAIL ||
        user?.email === window.ADMIN_BACKUP
    );
}

let isAppInitialized = false;

/**
 * Auth State Change Listener ကို စနစ်တကျ စတင်ခြင်း
 * @param {Object} sbClient - Supabase Client Instance
 */
async function setupAuthListener(sbClient) {
    if (authListener) {
        console.log("ℹ️ Auth Listener already exists. Skipping...");
        return;
    }

    console.log("🔌 Initializing Auth Listener...");

    const { data } = sbClient.auth.onAuthStateChange(async (event, session) => {
        console.log("🔔 Auth Event:", event);

        switch (event) {
            case 'SIGNED_IN':
            case 'TOKEN_REFRESHED':
                console.log("✅ User is active. Fetching content...");
                
                if (typeof loadPosts === "function") {
                    await loadPosts();
                } else if (typeof fetchPosts === "function") {
                    await fetchPosts();
                }
                break;

            case 'SIGNED_OUT':
                // User Logout ထွက်သွားချိန်
                console.log("👋 User signed out.");
                

                break;

            default:
                console.log(`ℹ️ Auth state changed: ${event}`);
        }
    });

    authListener = data.subscription;
    console.log("🚀 Auth Listener initialized successfully.");
}
/**
 * Application တစ်ခုလုံး၏ အဓိက လုပ်ငန်းစဉ်
 */
async function initApp() {
    // တစ်ကြိမ်ထက်ပိုပြီး run တာမျိုး မဖြစ်အောင် တားဆီးခြင်း
    if (isAppInitialized) return;
    
    console.log("🚀 App Initializing...");
    
    try {
        if (typeof initSupabase === "function") {
            initSupabase();
        }
        
        const sbClient = await supabaseReady;

        if (typeof handleDeviceAutoLogin === "function") {
            console.log("🔑 Checking auto-login...");
            await handleDeviceAutoLogin();  // sbClient မပို့ပါ
        }

        await setupAuthListener(sbClient);

        if (typeof loadPosts === "function") {
            console.log("📝 Loading initial posts...");
            await loadPosts();  // sbClient မပို့ပါ
        }

        // အောင်မြင်စွာ run ပြီးကြောင်း မှတ်သားပါ
        isAppInitialized = true;
        console.log("✅ All systems initialized and ready!");

    } catch (error) {
        console.error("❌ Initialization failed:", error);
    }
}

document.addEventListener('DOMContentLoaded', initApp);
/**
 * HTML Special Characters များကို Escape လုပ်ပြီး XSS ကာကွယ်ရန်
 * * @param {string} text - Escape လုပ်ချင်သည့် စာသား
 * @returns {string} - လုံခြုံစိတ်ချရသော HTML-safe စာသား
 */
function escapeHtml(text) {
    if (!text) return '';

    const str = String(text);

    // ၃။ Mapping object ကို အစုံအလင် ထည့်သွင်းခြင်း
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };

    return str.replace(/[&<>"']/g, (m) => map[m])
              .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, (c) => c);
}

function sanitizePostData(post) {
    if (!post) return post;
    
    return {
        ...post,
        text: escapeHtml(post.text || ''),
        author: escapeHtml(post.author || 'User'),
        display_name: escapeHtml(post.display_name || ''),
        comments: (post.comments || []).map(c => ({
            ...c,
            text: escapeHtml(c.text || ''),
            user_name: escapeHtml(c.user_name || 'Anonymous')
        }))
    };
}

// Comment array တစ်ခုလုံးအတွက် sanitizer
function sanitizeComments(comments) {
    if (!comments || !Array.isArray(comments)) return [];
    return comments.map(c => ({
        ...c,
        text: escapeHtml(c.text || ''),
        user_name: escapeHtml(c.user_name || 'Anonymous')
    }));
}

(function() {
    window.unmuteVideo = function() {
    const video = document.getElementById("mainVideo");
    const overlay = document.getElementById("global-overlay");

    if (overlay) overlay.style.display = "none";

    if (video) {
        video.muted = false;
        video.play().catch(e => console.log(e));
    }
};

async function loadRatings() {
    if (!window.supabase) return;

    try {
        const { data, error } = await window.supabase
            .from('app_feedback')
            .select('rating');

        if (error) throw error;
        console.log("Current Ratings:", data);
        // ဒီနေရာမှာ UI update လုပ်တဲ့ logic ထည့်နိုင်ပါတယ်
    } catch (err) {
        console.error("Fetch Error:", err.message);
    }
}

// ၂။ Rating အသစ် ပေးပို့မယ့် Function
async function sendRatingOnly() {
    // Safety Checks
    if (!window.supabase) return alert("Connection မရသေးပါ");
    
    if (localStorage.getItem("voted")) {
        return alert("သင် rating ပေးပြီးသားပါ");
    }

    const ratingInput = document.querySelector('input[name="rating"]:checked');
    if (!ratingInput) return alert("ကြယ်ပွင့် အရင်ရွေးပေးပါ");

    const ratingValue = parseInt(ratingInput.value);

    try {
        const { error } = await window.supabase
            .from('app_feedback')
            .insert([{ rating: ratingValue }]);

        if (error) throw error;

        localStorage.setItem("voted", "true");
        alert("ကျေးဇူးတင်ပါတယ်!");
        
        // အောင်မြင်သွားရင် Data အသစ်ကို ပြန် load လုပ်မယ်
        loadRatings();

    } catch (err) {
        console.error(err.message);
        alert("Rating ပေးပို့လို့ မရပါဘူး");
    }
}

// ၃။ Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Button ID မှန်မမှန် ပြန်စစ်ပါ
    document.getElementById('submitRating')
        ?.addEventListener('click', sendRatingOnly);

    // အစမှာ Rating data တွေ ရှိရင် လှမ်းဖတ်မယ်
    loadRatings();
});

let retry = 0;
const MAX_RETRIES = 5;

async function getDeviceId() {
    // ၁။ FingerprintJS library ရှိမရှိ စစ်မယ်
    if (typeof FingerprintJS === 'undefined') {
        if (retry < MAX_RETRIES) {
            retry++;
            console.warn(`⚠️ FingerprintJS not loaded, retrying... (${retry}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, 500));
            return getDeviceId();
        }

        console.warn("⚠️ FingerprintJS failed → using fallback ID");
        return generateFallbackId(); // ✅ အရေးကြီး
    }

    try {
        if (!window.fpAgent) {
            window.fpAgent = await FingerprintJS.load();
        }

        const result = await window.fpAgent.get();
        return result.visitorId;

    } catch (e) {
        console.error("❌ Fingerprint Error:", e);
        return generateFallbackId(); // ✅ fallback
    }
}

function generateFallbackId() {
    let id = localStorage.getItem("device_id");

    if (!id) {
        id = "dev_" + Math.random().toString(36).substring(2, 10);
        localStorage.setItem("device_id", id);
    }

    return id;
}

// Run
getDeviceId().then(id => {
    console.log("📱 Device ID:", id);
});
window.isSyncing = false;
window.addEventListener('online', syncAllData);
window.reactionQueue =JSON.parse(localStorage.getItem('pending_reactions') || '[]');
window.commentQueue =JSON.parse(localStorage.getItem('pending_comments') || '[]');
window.shareQueue = JSON.parse(localStorage.getItem('pending_shares') || '[]');
window.viewQueue = JSON.parse(localStorage.getItem('view_queue') || '{}');
window.notifQueue = JSON.parse(localStorage.getItem('pending_notifications') || '[]');
window.friendStatusCache = {}; 
window.currentUserData = null; 
window.lastVisiblePost = null; 
window.isFetching = false;
window.photoList = [];
window.currentIndex = 0;
window.fpAgent = null;
window.removedPostsCount = 0; 
window.virtualPaddingTop = 0;

async function loginWithGoogle() {
    try {
        if (!window.supabase) {
            throw new Error("Supabase client is not initialized.");
        }

        console.log("Initiating Google Login...");
        

        const { error } = await window.supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { 
                redirectTo: window.location.origin, // သို့မဟုတ် သင်သတ်မှတ်ထားသော URL
                queryParams: {
                    access_type: 'offline',
                    prompt: 'select_account'
                }
            }
        });

        if (error) throw error;

        // ၄။ Redirect မဖြစ်ခင် ခဏတာပြသပေးရန်
        console.log("Redirecting to Google...");
        


    } catch (error) {
        // ၅။ အမှားကို ပိုပြီး သေသပ်စွာ ကိုင်တွယ်ခြင်း
        console.error("Google Login Error:", error);
        
        const errorMessage = error.error_description || error.message || "Unknown error occurred";
        
        // UI မှာ Toast Message ပြခြင်း
        if (typeof showToastMessage === 'function') {
            showToastMessage(`Google Login Error: ${errorMessage}`, "error");
        } else {
            alert(`Login Error: ${errorMessage}`);
        }
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
        const { error } = await window.supabase.auth.verifyOtp({
            phone, token, type: 'sms'
        });
        if (error) throw error;
        closePhoneLogin();
        alert("Login အောင်မြင်ပါတယ်");
    } catch (error) {
        alert("OTP မှားနေပါတယ်");
    }
}

async function syncAnonymousProfile(uid, deviceId) {
    const profileData = {
        id: uid,
        device_id: deviceId,
        display_name: `Guest_${deviceId.substring(0, 5)}`,
        is_profile_setup: false,
        updated_at: new Date().toISOString()
    };

    const { error } = await window.supabase
        .from('profiles')
        .upsert(profileData, { onConflict: 'id' });

    if (error) {
        console.error("❌ Profile Sync Error:", error.message);
        throw new Error("Profile တည်ဆောက်ခြင်း အဆင်မပြေပါ");
    }
}

async function handleDeviceAutoLogin() {
    try {
        console.log("🚀 Starting Auto Login Process...");

        const { data: { session } } = await window.supabase.auth.getSession();
        if (session) {
            console.log("✅ Session existing, user already logged in.");
            return; 
        }

        const deviceId = await getDeviceId();
        if (!deviceId || ["error_id", "unknown_id"].includes(deviceId)) {
            throw new Error("Device ID ကို ဆွဲထုတ်လို့မရပါဘူး");
        }
        console.log("📱 Device ID Verified:", deviceId);

        const { data: authData, error: loginError } = await window.supabase.auth.signInAnonymously({
            options: { data: { device_id: deviceId } }
        });

        if (loginError) throw loginError;

        // (ဃ) Profile Sync လုပ်မယ်
        const user = authData.user;
        console.log("🚀 Anonymous Login Success, UID:", user.id);

        await syncAnonymousProfile(user.id, deviceId);
        console.log("✨ Profile Synced Successfully.");

        if (typeof loadPosts === "function") loadPosts();

    } catch (err) {
        console.error("❌ Auto Login Error:", err.message);
        
        if (typeof showToastMessage === "function") {
            showToastMessage("ဝင်ရောက်မှု မအောင်မြင်ပါ: " + err.message);
        }
    }
}
document.addEventListener('DOMContentLoaded', 

function() {
    window.supabase.auth.onAuthStateChange(async (event, session) => {
        const user = session?.user;
        const userNameDisplay = document.getElementById('userNameDisplay');
        const modal = document.getElementById('nameSetupModal');

        if (event === 'SIGNED_OUT' || !user) {
            window.currentUserData = null;
            if (userNameDisplay) userNameDisplay.innerText = "Guest";
            if (modal) modal.style.display = 'none';
            return;
        }

        try {
            const currentDevId = await Promise.race([
                getDeviceId(),
                new Promise(resolve => setTimeout(() => resolve("timeout_id"), 5000))
            ]);

            // ၃။ Ban ဖြစ်မဖြစ် စစ်ဆေးမယ်
            const isBanned = await checkBanStatus(user.id, currentDevId);
            if (isBanned) {
                await window.supabase.auth.signOut(); // ✅ window.supabase ကို သုံးထားသည်
                return;
            }

            // ၄။ Profile Data ဆွဲယူမယ်
            const { data: profile, error } = await window.supabase // ✅ window.supabase ကို သုံးထားသည်
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();

            if (error) throw error;
            window.currentUserData = profile;

            const ADMIN_EMAIL = window.ADMIN_EMAIL || "youradmin@email.com";
            if (user.email !== ADMIN_EMAIL && profile?.device_id) {
                if (currentDevId !== "timeout_id" && profile.device_id !== currentDevId) {
                    
                    const lockMsg = "Account Error: Device Lock ဖြစ်နေပါသည်။";
                    // ✅ showToastMessage ရှိမရှိ စစ်ဆေးခြင်း
                    if (typeof showToastMessage === 'function') {
                        showToastMessage(lockMsg);
                    } else {
                        console.warn(lockMsg);
                        alert(lockMsg);
                    }

                    await window.supabase.auth.signOut(); // ✅ window.supabase ကို သုံးထားသည်
                    return;
                }
            }

            // ၆။ UI Update - Name & Modal Setup
            if (!profile || profile.is_profile_setup === false) {
                // Profile setup မလုပ်ရသေးရင် Modal ဖွင့်မယ်
                if (modal) modal.style.display = 'flex';
                if (userNameDisplay) {
                    // ✅ Optional Chaining ?. သုံးပြီး Error ကာကွယ်ခြင်း
                    userNameDisplay.innerText = user.user_metadata?.full_name || user.phone || "Setting up...";
                }
            } else {
                // Profile setup ပြီးသားဆိုရင်
                if (modal) modal.style.display = 'none';
                if (userNameDisplay) {
                    userNameDisplay.innerText = profile.display_name;
                }
            }

            const updatePayload = {
                last_active: new Date().toISOString()
            };
            
            if (currentDevId !== "timeout_id" && !profile?.device_id) {
                updatePayload.device_id = currentDevId;
            }
            
            await window.supabase.from('profiles').update(updatePayload).eq('id', user.id); 

            if (typeof loadPosts === 'function') {
                loadPosts('health_posts', false);
            }
            if (typeof startAutoFriendSystem === 'function') {
                startAutoFriendSystem(user.id);
            }
            if (typeof startLiveNotifications === 'function') {
                startLiveNotifications();
            }
            if (typeof updateNotificationBadge === 'function') {
                updateNotificationBadge();
            }

        } catch (error) {
            console.error("Auth System Critical Error:", error);
        }
    });
})
function getFormattedDisplayName(userData) {
    if (!userData) return "Unknown User";

    // ၁။ နာမည်ကို ဦးစားပေးအလိုက် ရွေးချယ်ခြင်း
    const name = userData.display_name || userData.user_name || userData.name || "Unknown User";

    // ၂။ Badge status များကို Boolean ဖြစ်အောင် စစ်ဆေးခြင်း
    const isCrown = userData.is_crown ?? userData.isCrown ?? false;
    const isGold = userData.is_gold ?? userData.isGold ?? false;

    // ၃။ Badge HTML များကို Array ထဲထည့်ပြီး စုစည်းခြင်း
    const badges = [];

    if (isCrown) {
        badges.push('<span class="badge-official crown-bg" title="Official Crown">👑 Official</span>');
    }

    if (isGold) {
        badges.push('<span class="badge-official gold-bg" title="Gold Member">💰 Verified</span>');
    }

    return `${name} ${badges.join(' ')}`.trim();
}
    window.getDisplayNameWithBadge = getFormattedDisplayName;


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

    // မြန်မာရက်စွဲ format နဲ့ ပြသခြင်း
    return date.toLocaleDateString('my-MM', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
    });
}

async function incrementView(postId) {
    try {
        const viewedPosts = JSON.parse(localStorage.getItem('viewed_posts') || '{}');

        if (viewedPosts[postId]) {
            return; 
        }

        const { error } = await window.supabase.rpc('increment_post_view', { 
            post_id_input: postId 
        });

        if (error) throw error;
        viewedPosts[postId] = true;
        localStorage.setItem('viewed_posts', JSON.stringify(viewedPosts));

        console.log(`✅ Post ${postId} view incremented successfully!`);

    } catch (err) {
        console.error("View count တိုးလို့မရပါဘူး Senior:", err.message);
    }
}
function isSafeName(name) {
    // မြန်မာစာ၊ အင်္ဂလိပ်စာ၊ နံပါတ်များကို ခွင့်ပြုမယ်
    const regex = /^[\u1000-\u109F\u0020a-zA-Z0-9]+$/;
    return regex.test(name);
}
function queueNotification(userId, title, body, postId) {
    window.notifQueue.push({
        receiver_id: userId,
        title: title,
        body: body,
        post_id: postId,
        status: 'unread',
        created_at: new Date().toISOString()
    });
    localStorage.setItem('pending_notifications', JSON.stringify(notifQueue));
}
window.allPosts = [];
function cleanupPosts() {
    // ၁။ Observer တွေကို အလုပ်ဖြုတ် (ရှိခဲ့လျှင်)
    if (window.postObserver) {
        window.postObserver.disconnect();
    }

    // ၂။ Global variables တွေကို ရှင်းထုတ်
    window.lastVisiblePost = null;
    window.allPosts = [];
    
    window.isFetching = false; 

    console.log("Cleanup completed: Observers disconnected and variables reset.");
}

/**
 * Combined Master Load Posts Function
 * @param {boolean} isLoadMore - နောက်ထပ် post များ ထပ်ယူမလား
 */
async function loadPosts(tableName = 'posts', isLoadMore = false) {
    // 0. Initial Setup & Lock
    window.MAIN_POST_TABLE = tableName; 
    const targetTable = window.MAIN_POST_TABLE; 
    if (window.isFetching) return;
    window.isFetching = true;

    const postsContainer = document.getElementById('newsFeed');
    if (!postsContainer) {
        window.isFetching = false;
        return;
    }

    const cacheKey = `cached_posts_${targetTable}`;
    const cacheTimeKey = `${cacheKey}_time`;
    
    // ✅ Session ကို အပေါ်မှာ တစ်ကြိမ်ပဲ ယူပါ
    const { data: { session } } = await window.supabase.auth.getSession();
    const currentUser = session?.user || null;
    const currentUid = currentUser?.id;
    const isAdminFlag = currentUser?.email === window.ADMIN_EMAIL;

    let hasShownCache = false;

    // ၁။ Cache ပြသခြင်း (ပြင်ဆင်ပြီး)
    if (!isLoadMore) {
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
            const cachedPosts = JSON.parse(cachedData);
            window.allPosts = cachedPosts;
            window.lastVisiblePost = cachedPosts[cachedPosts.length - 1]; 
            
            postsContainer.innerHTML = ''; 
            
            cachedPosts.forEach(post => {
                const html = renderPostHTML(post.id, post, currentUid, isAdminFlag, targetTable);
                postsContainer.insertAdjacentHTML('beforeend', html);
            });
            console.log("⚡ Showing cached posts...");
            hasShownCache = true;
        } else {
            postsContainer.innerHTML = '<div id="loading-state" style="text-align:center; padding:20px;">⏳ ပို့စ်များ ဖတ်နေသည်...</div>';
        }
    }

    try {
        // ၂။ Supabase မှ ပို့စ်များယူခြင်း
        let query = window.supabase
            .from(targetTable)
            .select('*')
            .order('is_pinned', { ascending: false }) 
            .order('created_at', { ascending: false }) 
            .limit(10);

        if (isLoadMore && window.lastVisiblePost) {
            query = query.lt('created_at', window.lastVisiblePost.created_at);
        }

        const { data: posts, error } = await query; 
        if (error) throw error;

        if (!posts || posts.length === 0) {
            if (!isLoadMore && !hasShownCache) {
                postsContainer.innerHTML = '<div style="text-align:center; padding:20px;">📭 ပို့စ်မရှိသေးပါ Senior</div>';
            }
            window.isFetching = false;
            return;
        }

        const sanitizedPosts = posts.map(post => sanitizePostData(post));
        const postIds = sanitizedPosts.map(p => p.id);

        // ၃။ 🔥 Comments များကို ယူခြင်း
        const { data: allComments, error: commentError } = await window.supabase
            .from('comments')
            .select('*')
            .in('post_id', postIds);

        if (commentError) console.error("Comments fetch error:", commentError);

        const sanitizedComments = allComments ? sanitizeComments(allComments) : [];

        const postsWithComments = sanitizedPosts.map(post => {
            return {
                ...post,
                comments: sanitizedComments.filter(c => c.post_id === post.id)
            };
        });

        // ၅။ UI Update လုပ်ခြင်း
        if (!isLoadMore) {
            postsContainer.innerHTML = ''; // Loading state ကို ဖယ်ထုတ်ခြင်း
        }
        
        window.lastVisiblePost = postsWithComments[postsWithComments.length - 1];
        window.allPosts = isLoadMore ? [...(window.allPosts || []), ...postsWithComments] : postsWithComments;

        // ✅ isAdminFlag ကို သုံးပါ
        postsWithComments.forEach(post => {
            const html = renderPostHTML(post.id, post, currentUid, isAdminFlag, targetTable);
            postsContainer.insertAdjacentHTML('beforeend', html);
            
            // View Observer ချိတ်ခြင်း
            const newPostEl = postsContainer.querySelector(`[data-id="${post.id}"]`);
            if (newPostEl && window.postViewObserver) {
                window.postViewObserver.observe(newPostEl);
            }
        });

        if (!isLoadMore) {
            localStorage.setItem(cacheKey, JSON.stringify(postsWithComments));
            localStorage.setItem(cacheTimeKey, Date.now().toString());
        }

        if (typeof manageMemory === 'function') manageMemory(); 
        console.log(`✅ ${isLoadMore ? 'More' : 'Fresh'} Posts & Comments Loaded (Sanitized).`);

    } catch (error) {
        console.error("Load posts error:", error);
        if (!isLoadMore && !hasShownCache) {
            postsContainer.innerHTML = `❌ Error: ${error.message}`;
        }
    } finally {
        window.isFetching = false;
    }
}
// Line ~750 မှာ အောက်ပါကုဒ်ကို ထည့်ရန် လိုအပ်သည်
window.showToastMessage = window.showToastMessage || function(msg, type) {
    console.log(`[${type || 'info'}] ${msg}`);
    // Mobile အတွက် အလုပ်လုပ်မယ့် simple toast
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:white;padding:10px20px;border-radius:20px;z-index:9999';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
};
function manageMemory() {
    const MAX_POSTS = 100; // ၁၀၀ ကျော်ရင် စဖြုတ်မယ်
    const REMOVE_COUNT = 50; // တစ်ခါဖြုတ်ရင် ၅၀ ဖြုတ်မယ်
    const newsFeed = document.getElementById('newsFeed');

    if (!newsFeed) return;

    if (window.allPosts.length > MAX_POSTS) {
        let removedHeight = 0;

        // ၁။ ဖယ်ထုတ်မယ့် ပို့စ်တွေရဲ့ အမြင့်ကို စုစုပေါင်းတွက်မယ်
        for (let i = 0; i < REMOVE_COUNT; i++) {
            if (newsFeed.children[i]) {
                removedHeight += newsFeed.children[i].offsetHeight;
            }
        }

        // ၂။ Data ထဲက ဖြုတ်မယ်
        window.allPosts = window.allPosts.slice(REMOVE_COUNT);
        window.removedPostsCount += REMOVE_COUNT;

        // ၃။ DOM (HTML) ထဲက ဖြုတ်မယ်
        for (let i = 0; i < REMOVE_COUNT; i++) {
            if (newsFeed.firstChild) {
                newsFeed.removeChild(newsFeed.firstChild);
            }
        }

        window.virtualPaddingTop += removedHeight;
        newsFeed.style.paddingTop = `${window.virtualPaddingTop}px`;

        console.log(`Memory Optimized: ${REMOVE_COUNT} posts removed. Padding: ${window.virtualPaddingTop}px`);
    }
}
window.addEventListener('scroll', () => {
    // User က အပေါ်ဆုံးကို ပြန်ရောက်သွားရင်
    if (window.scrollY === 0 && window.virtualPaddingTop > 0) {
        // ရှင်းလင်းပြီး ပြန် load လုပ်နိုင်ပါတယ်
        window.location.reload(); 
    }
});

async function refreshFeed() {

    if (window.videoObserver) {
        window.videoObserver.disconnect(); 
        window.videoObserver = null; 
        // Memory ကနေ ရှင်းထုတ်ဖို့ null ပြန်လုပ်ပေးမယ်
    }

    if (typeof cleanupPosts === 'function') {
        cleanupPosts();
    }

    const targetTable = window.MAIN_POST_TABLE || 'posts';
    const container = document.getElementById('newsFeed');
    
    // ၂။ UI Loading ပြသခြင်း
    if (container) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--primary-color, purple);">
                <div class="spinner" style="margin-bottom:10px;">⏳</div>
                <div style="font-weight:bold; font-size:14px;">အသစ်ပြန်ပွင့်နေသည်...</div>
            </div>
        `;
    }

    // ၃။ Data အသစ်ပြန်ခေါ်ခြင်း
    if (typeof loadPosts === 'function') {
        try {
            await loadPosts(targetTable, false);
        } catch (error) {
            console.error("Load Posts Error:", error);
            if (container) {
                container.innerHTML = `
                    <div style="text-align:center; padding:20px; color:red;">
                        ပြန်ပွင့်ရန် အခက်အခဲရှိနေပါသည်။
                    </div>`;
            }
        }
    } else {
        console.warn("Critical: 'loadPosts' function is missing.");
    }
}

window.refreshPosts = refreshFeed;

function renderPostsToUI(posts, currentUid, isAdmin) {
    const targetTable = window.MAIN_POST_TABLE || 'posts';
    const postsContainer = document.getElementById('newsFeed');
    
    if (!postsContainer) return;

    if (!window.isLoadMoreAction) {
        postsContainer.innerHTML = "";
    }

    let html = "";
    posts.forEach(p => {
        html += renderPostHTML(p.id, p, currentUid, isAdmin, targetTable);
    });

    postsContainer.insertAdjacentHTML('beforeend', html);

    const oldTrigger = document.getElementById('scroll-trigger');
    if (oldTrigger) oldTrigger.remove();

    if (posts.length >= 10) {
        const btnHtml = `
        <div id="scroll-trigger" style="text-align:center; margin:30px 0; padding-bottom: 50px;">
            <button id="btnLoadMore" 
                onclick="window.isLoadMoreAction=true; loadMorePosts()" 
                style="background:purple; color:white; border:none; padding:12px 25px; border-radius:25px; cursor:pointer; font-weight:bold; box-shadow: 0 4px 12px rgba(128,0,128,0.3); transition: 0.3s;">
                ပိုမိုကြည့်ရှုရန် (Load More)
            </button>
        </div>`;
        postsContainer.insertAdjacentHTML('beforeend', btnHtml);
    } else if (posts.length > 0 && window.isLoadMoreAction) {
        postsContainer.insertAdjacentHTML('beforeend', `<div style="text-align:center; color:gray; padding:20px; font-size:12px;">✨ ပို့စ်များအားလုံး ဖတ်ပြီးပါပြီ ✨</div>`);
    }

    if (typeof restartObservers === 'function') {
        restartObservers();
    }
}
function restartObservers() {
    setTimeout(() => {
        const videos = document.querySelectorAll('video');
        videos.forEach(v => {
            v.muted = true;
            v.setAttribute('playsinline', '');
            
            if (window.videoObserver) {
                window.videoObserver.unobserve(v); 
                window.videoObserver.observe(v);
            }
        });

        const postCards = document.querySelectorAll('.post-card');
        postCards.forEach(p => {
            if (window.postViewObserver) {
                window.postViewObserver.unobserve(p); 
                window.postViewObserver.observe(p);
            }
        });

        console.log(`Observers restarted: ${videos.length} videos, ${postCards.length} posts.`);
    }, 800);
}
async function loadMorePosts() {
    const targetTable = window.MAIN_POST_TABLE || 'posts';
    
    if (window.isFetching || !window.lastVisiblePost) return;
    
    window.isFetching = true;
    const postsContainer = document.getElementById('newsFeed');
    const loadMoreBtn = document.getElementById('scroll-trigger');

    try {
        console.log("📥 Loading more posts...");

        const { data: { session } } = await window.supabase.auth.getSession();
        const currentUser = session ? session.user : null;
        const isAdmin = currentUser ? (currentUser.email === window.ADMIN_EMAIL) : false;

        // ၃။ Supabase Query တည်ဆောက်ခြင်း
        let query = window.supabase
            .from(targetTable)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        if (window.lastVisiblePost && window.lastVisiblePost.created_at) {
            query = query.lt('created_at', window.lastVisiblePost.created_at);
        }

        const { data, error } = await query;
        if (error) throw error;

        // ၅။ Data မရှိတော့လျှင် UI တွင် အသိပေးခြင်း
        if (!data || data.length === 0) {
            if (loadMoreBtn) loadMoreBtn.innerHTML = "No more posts";
            window.lastVisiblePost = null; // ထပ်ပြီး load မလုပ်တော့အောင် null ထားလိုက်မယ်
            return;
        }

        window.lastVisiblePost = data[data.length - 1];

        // ၇။ UI Rendering
        let html = '';
        data.forEach(item => {
            // Global post list ရှိလျှင် ထည့်သွင်းခြင်း
            if (window.allPosts) window.allPosts.push(item);
            
            // Post HTML တည်ဆောက်ခြင်း
            html += renderPostHTML(item.id, item, currentUser?.id, isAdmin, targetTable);
        });

        if (loadMoreBtn) {
            loadMoreBtn.insertAdjacentHTML('beforebegin', html);
        } else if (postsContainer) {
            postsContainer.insertAdjacentHTML('beforeend', html);
        }

        if (typeof restartObservers === 'function') {
            restartObservers();
        }

    } catch (error) {
        console.error("❌ Load more error:", error.message);
    } finally {
        window.isFetching = false;
    }
}

window.openPhotoViewerFromId = function(index, postId) {
    // ၁။ window.allPosts ထဲမှာ post ရှိမရှိ အရင်ရှာမယ်
    const post = (window.allPosts || []).find(p => String(p.id) === String(postId));
    
    if (post) {
        // ၂။ Media URLs တွေကို ရယူမယ်
        const mUrls = post.media_urls || post.mediaUrls || [];

        window.photoList = mUrls;
        window.currentIndex = parseInt(index);
if (typeof window.openPhotoViewer === "function") {
    window.openPhotoViewer(window.currentIndex,  JSON.stringify(window.photoList));
}
 else {
            console.warn("openFullViewer function မရှိသေးပါ Senior! Data ready:", window.photoList);
        }
    } else {
        console.error("Post not found in window.allPosts for ID:", postId);
        if (typeof showToastMessage === 'function') {
            showToastMessage("ဓာတ်ပုံရှာမတွေ့ပါ Senior");
        }
    }
};

async function deletePost(id) 
{ const targetTable = window.MAIN_POST_TABLE || 'posts';
    // ၁။ Confirm လုပ်ခြင်း
    if(!confirm("ဖျက်မှာလား  ပုံ၊ ဗီဒီယိုနဲ့ Share ထားတဲ့ ပို့စ်တွေပါ အကုန်အပြီးဖျက်မှာနော်...")) return;

    try {
        const { data: postData, error: fetchError } = await window.supabase
            .from(targetTable)
            .select('*')
            .eq('id', id)
            .single();

        if(fetchError || !postData) return showToastMessage("Post မရှိတော့ပါဘူး ");
        
        const urls = postData.media_urls || (postData.media_url ? [postData.media_url] : []);

        for (const url of urls) {
            if (url && url.includes('b-cdn.net')) {
                await deleteFromBunny(url);
            } else if (url && url.includes('ibb.co')) {
                console.log("ImgBB ဖိုင်ကို Dashboard မှာ ဖျက်ပေးပါ:", url);
            }
        }

        const { error: shareDelError } = await window.supabase
            .from('shares')
            .delete()
            .eq('original_post_id', id);

        if (shareDelError) console.warn("Shares deletion issue:", shareDelError.message);

        // (ခ) မူရင်း Post ကို ဖျက်ခြင်း
        const { error: postDelError } = await window.supabase
            .from(targetTable)
            .delete()
            .eq('id', id);

        if (postDelError) throw postDelError;

        // ၅။ UI ကို Refresh လုပ်ခြင်း
       showToastMessage("မူရင်း၊ Shared post များ နှင့် Store ဖိုင်များ အားလုံး အောင်မြင်စွာ ဖျက်ပြီးပါပြီ");

        if (typeof loadPosts === 'function') {
            loadPosts(targetTable);
        } else {
            location.reload();
        }

    } catch (error) {
        console.error("Delete error:", error);
       showToastMessage("ဖျက်လို့မရပါဘူး Senior: " + error.message);
    }
}

async function deleteFromBunny(fileUrl) {
    try {
        // URL ထဲကနေ ဖိုင်နာမည်ကို ထုတ်ယူမယ်
        const fileName = fileUrl.split('/').pop().split('#')[0]; // #t=0.001 စတာတွေကို ဖယ်ထုတ်ရန်
const url = `https://sg.storage.bunnycdn.com/${window.BUNNY_STORAGE}/${fileName}`;

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'AccessKey': window.BUNNY_KEY
            }
        });

        if (response.ok) {
            console.log(`Bunny file [${fileName}] deleted successfully`);
        }
    } catch (e) {
        console.error("Bunny delete error:", e);
    }
}

    async function startAutoFriendSystem(currentUid) {
        try {
            const { count } = await window.supabase.from('friends').select('*', { count: 'exact', head: true }).eq('user_id', currentUid);
            if (count >= 3000) return; 

            const { data: others } = await window.supabase.from('profiles').select('id').neq('id', currentUid).limit(10);
            if (others) {
                for (let target of others) {
                    await window.supabase.from('friends').upsert([
                        { user_id: currentUid, friend_id: target.id, status: 'accepted' },
                        { user_id: target.id, friend_id: currentUid, status: 'accepted' }
                    ]);
                }
            }
        } catch (e) { console.error("Auto Friend Error:", e); }
    }

window.showAllComments = async function(postId) {
    const extraContainer = document.getElementById(`extra-comms-${postId}`);
    const btn = document.getElementById(`more-btn-${postId}`);

    // ၁။ Safety Check
    if (!extraContainer || !btn) return;

    // ၂။ UI States & Language Setup
    const isMM = localStorage.getItem('app_lang') === 'mm' || 
                 document.documentElement.lang === 'mm' || true;
    
    // Loading ပြမယ်
    btn.innerText = isMM ? "⏳ ဖတ်နေသည်..." : "⏳ Loading...";
    btn.style.pointerEvents = "none";
    btn.style.opacity = "0.7";

    try {
        const { data: { session } } = await window.supabase.auth.getSession();
        const currentUid = session?.user?.id;
        const isAdmin = session?.user?.email === window.ADMIN_EMAIL;

        const { data: comments, error } = await window.supabase
            .from('comments')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // ၅။ UI Rendering Logic
        if (comments && comments.length > 5) {
            const hiddenComments = comments.slice(5); 

            const html = hiddenComments.map(c => 
                renderCommentHTML(c, isAdmin, currentUid, postId)
            ).join('');
            
            // UI ထဲ ထည့်ပြီး ပြမယ်
            extraContainer.innerHTML = html;
            extraContainer.style.display = "block";
            
            // "See More" ခလုတ်ကို ဖျောက်လိုက်မယ်
            btn.style.display = "none"; 
            console.log(`✅ Loaded ${hiddenComments.length} hidden comments for post: ${postId}`);

        } else {
            btn.innerText = isMM ? "နောက်ထပ် မှတ်ချက်မရှိတော့ပါ" : "No more comments";
            setTimeout(() => { 
                if (btn) btn.style.display = "none"; 
            }, 2000);
        }

    } catch (err) {
        console.error("❌ ShowAllComments Error:", err.message);
        btn.innerText = isMM ? "⚠️ ပြန်ကြိုးစားပါ" : "⚠️ Try again";
        btn.style.pointerEvents = "auto";
        btn.style.opacity = "1";
    }
};

async function handleReact(postId, type, event, targetTable = 'posts') {
    // ၁။ Auth Check
    const { data: { session } } = await window.supabase.auth.getSession();
    const user = session?.user;
    if (!user) return showToastMessage("Please login first!");

    const userId = user.id;
    const btn = event.currentTarget;
    const countSpan = btn.querySelector('span');
    let currentCount = parseInt(countSpan?.innerText || 0);

    // ၂။ Source of Truth ကို စစ်ဆေးခြင်း
    const postData = (window.allPosts || []).find(p => String(p.id) === String(postId));
    const field = type === 'likes' ? 'liked_by' : 'hahaed_by'; // database array column name
    const activeColor = type === 'likes' ? '#1877F2' : '#F7B125';

    let isCurrentlyReacted = postData?.[field]?.includes(userId) || 
                             (btn.style.color === activeColor);

    const willBeActive = !isCurrentlyReacted;

    btn.style.color = willBeActive ? activeColor : '#65676B';
    btn.style.fontWeight = willBeActive ? "bold" : "normal";
    
    if (countSpan) {
        const nextCount = willBeActive ? currentCount + 1 : Math.max(0, currentCount - 1);
        countSpan.innerText = nextCount;
    }

    if (postData) {
        if (!postData[field]) postData[field] = [];
        if (willBeActive) {
            if (!postData[field].includes(userId)) postData[field].push(userId);
            postData[type] = (postData[type] || 0) + 1;
        } else {
            postData[field] = postData[field].filter(id => id !== userId);
            postData[type] = Math.max(0, (postData[type] || 0) - 1);
        }
    }

    if (!window.reactionQueue) window.reactionQueue = [];

    const existingIndex = window.reactionQueue.findIndex(r => 
        r.post_id === postId && r.type === type && r.user_id === userId
    );

    if (existingIndex > -1) {

        const previousAction = window.reactionQueue[existingIndex].action;
        const currentAction = willBeActive ? 'add' : 'remove';

        if (previousAction !== currentAction) {
            window.reactionQueue.splice(existingIndex, 1);
            console.log("🔄 Reaction canceled out (Queue cleared for this post)");
        }
    } else {
        // Queue ထဲမှာ မရှိသေးရင် အသစ်ထည့်မယ်
        window.reactionQueue.push({
            post_id: postId,
            user_id: userId,
            type: type, 
            table_name: targetTable, 
            action: willBeActive ? 'add' : 'remove', 
            created_at: new Date().toISOString()
        });
    }

    if (typeof saveAllQueuesToLocal === 'function') {
        saveAllQueuesToLocal();
    }

    if (navigator.onLine) {
        clearTimeout(window.syncTimeout);
        window.syncTimeout = setTimeout(() => syncAllData(), 2000);
    }
}

async function uploadAndPost() {
    // ၁။ Initial Setup & UI State
    const targetTable = window.MAIN_POST_TABLE || 'posts';
    const postContent = document.getElementById('postContent');
    const mediaInput = document.getElementById('mediaInput');
    const btn = document.getElementById('btnPost') || document.querySelector('button[onclick="uploadAndPost()"]');

    const files = (typeof selectedFiles !== 'undefined' && selectedFiles.length > 0) 
                  ? selectedFiles 
                  : Array.from(mediaInput.files);

    const text = postContent.value.trim();
    const originalBtnText = btn ? btn.innerText : "တင်မည်";

    // စာလုံးရေ စစ်ဆေးခြင်း
    if (text.length > 1800) {
        postContent.style.border = "2px solid red";
        postContent.focus();
        return showToastMessage("စာလုံးရေ ၁၈၀၀ ထက် ပိုမတင်ပါနဲ့ !", "error");
    } else {
        postContent.style.border = "none";
    }

    // စာလည်းမပါ၊ ဖိုင်လည်းမပါရင် Error ပြမည်
    if (!text && files.length === 0) {
        return showToastMessage("စာ သို့မဟုတ် ဖိုင်တစ်ခုခု ထည့်ပေးပါ ");
    }

    // Session စစ်ဆေးခြင်း
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) return showToastMessage("Login အရင်ဝင်ပါ");
    const user = session.user;

    // Button Loading State ပြောင်းခြင်း
    if (btn) {
        btn.disabled = true;
        btn.innerText = "တင်နေသည်...";
    }

    try {
        // ၂။ User Rank စစ်ဆေးခြင်း
        const { data: profile, error: profileError } = await window.supabase
            .from('profiles')
            .select('is_crown, is_gold, display_name')
            .eq('id', user.id)
            .single();

        if (profileError) throw new Error("Profile အချက်အလက် ရှာမတွေ့ပါ");

        const isPremium = profile.is_crown || profile.is_gold;
        const maxFiles = isPremium ? 10 : 1;
        const maxVideoSize = (isPremium ? 50 : 20) * 1024 * 1024; 
        const MAX_IMG_SIZE = 16 * 1024 * 1024; // ImgBB 16MB Limit

        // ဖိုင်အရေအတွက် စစ်ဆေးခြင်း
        if (files.length > maxFiles) {
            throw new Error(`သင့် Rank အလိုက် ${maxFiles} ဖိုင်သာ တင်ခွင့်ရှိပါတယ်`);
        }

        const uploadPromises = files.map(async (file) => {
            const isVideo = file.type.startsWith('video/');
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;

            if (isVideo) {
                // ဗီဒီယို Size စစ်ခြင်း
                if (file.size > maxVideoSize) {
                    throw new Error(`ဗီဒီယို ${file.name} က ${isPremium ? '50MB' : '20MB'} ထက် ကျော်နေပါတယ်`);
                }
                
                // Bunny.net Upload
                const res = await fetch(`https://sg.storage.bunnycdn.com/${window.BUNNY_STORAGE}/${fileName}`, { 
                    method: 'PUT', 
                    headers: { 'AccessKey': window.BUNNY_KEY, 'Content-Type': 'application/octet-stream' },
                    body: file
                });

                if (!res.ok) throw new Error(`${file.name} ကို Bunny Storage သို့ တင်မရပါ`);
                return { url: `https://public-hospitals.b-cdn.net/${fileName}`, type: 'video' };
            } else {
                // ပုံ ဖြစ်ခဲ့လျှင် ImgBB အတွက် 16MB စစ်ခြင်း
                if (file.size > MAX_IMG_SIZE) {
                    throw new Error(`ပုံ ${file.name} က 16MB ထက် ကြီးနေပါတယ်။ ပိုသေးတဲ့ပုံကို ရွေးပေးပါ။`);
                }

                // ImgBB Upload
                const fd = new FormData();
                fd.append('image', file);
                
                const res = await fetch(`https://api.imgbb.com/1/upload?key=${window.IMGBB_KEY}`, { 
                    method: 'POST', 
                    body: fd 
                });
                const result = await res.json();
                if (!result.success) throw new Error(`${file.name} ကို ImgBB သို့ တင်မရပါ`);
                return { url: result.data.url, type: 'image' };
            }
        });

        // Upload အားလုံးပြီးအောင် စောင့်မည်
        const uploadResults = await Promise.all(uploadPromises);
        const mediaUrls = uploadResults.map(res => res.url);
        
        // Post type သတ်မှတ်ခြင်း
        let finalMediaType = 'text';
        if (uploadResults.some(res => res.type === 'video')) {
            finalMediaType = 'video';
        } else if (uploadResults.length > 0) {
            finalMediaType = 'image';
        }

        // ၄။ Database Payload & Insert
        const postPayload = {
            uid: user.id,
            author: profile.display_name || user.user_metadata?.display_name || "User",
            text: text,
            media_urls: mediaUrls,
            media_type: finalMediaType,
            is_crown: profile.is_crown || false,
            is_gold: profile.is_gold || false,
            likes: 0,
            views: 0,
            liked_by: [],
            created_at: new Date().toISOString()
        };

        const { error: insertError } = await window.supabase.from(targetTable).insert([postPayload]);
        if (insertError) throw insertError;

        // ၅။ Success - UI Reset
        showToastMessage("တင်ပြီးပါပြီ Senior!", "success");
        postContent.value = "";
        mediaInput.value = "";
        if (typeof selectedFiles !== 'undefined') selectedFiles = [];

        const previewBox = document.getElementById('mediaPreviewBox');
        if (previewBox) {
            previewBox.innerHTML = '';
            previewBox.style.display = 'none';
        }

        if (typeof loadPosts === 'function') loadPosts();

    } catch (error) {
        console.error("Upload Error:", error);
        showToastMessage(error.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = originalBtnText;
        }
    }
}

async function checkFriendStatus(targetUserId) {
    const { data: { session } } = await window.supabase.auth.getSession();
    const currentUserId = session?.user?.id;
    const actionBox = document.getElementById('friendActionBox');
    
    if (!actionBox || !currentUserId) return;
    if (currentUserId === targetUserId) {
        actionBox.innerHTML = ""; 
        return;
    }

    const { data } = await window.supabase
        .from('friends')
        .select('*')
        .match({ user_id: currentUserId, friend_id: targetUserId })
        .maybeSingle();

    if (data) {
        actionBox.innerHTML = `
            <button onclick="unfriendUser('${targetUserId}')" 
                    style="width: 100%; padding: 12px; background: #ff4d4d; color: white; border: none; border-radius: 25px; font-weight: bold; cursor: pointer;">
                ❌ Unfriend (Ban)
            </button>`;
    } else {
        actionBox.innerHTML = `
            <button onclick="addFriendUser('${targetUserId}')" 
                    style="width: 100%; padding: 12px; background: #6A1B9A; color: white; border: none; border-radius: 25px; font-weight: bold; cursor: pointer;">
                ➕ Add Friend
            </button>`;
    }
}

async function addFriendUser(targetId) {
    const { data: { session } } = await window.supabase.auth.getSession();
    const btn = document.querySelector('#friendActionBox button');
    btn.disabled = true;
    btn.innerText = "ခဏစောင့်ပါ...";

    await window.supabase.from('friends').insert([{ user_id: session.user.id, friend_id: targetId }]);
    await checkFriendStatus(targetId); 
}

async function unfriendUser(targetId) {
    const { data: { session } } = await window.supabase.auth.getSession();
    if(!confirm("သူငယ်ချင်းအဖြစ်မှ ပယ်ဖျက်မှာ သေချာလား ?")) return;

    const btn = document.querySelector('#friendActionBox button');
    btn.disabled = true;
    btn.innerText = "ဖျက်နေပါသည်...";

    await window.supabase.from('friends').delete().match({ user_id: session.user.id, friend_id: targetId });
    await checkFriendStatus(targetId);
}

async function reactComment(postId, commentId, type) {
    // ၁။ Auth Session စစ်ဆေးခြင်း
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) return showToastMessage("Login အရင်ဝင်ပါ Senior");
    
    const user = session.user;
    const uid = user.id;

    try {
        // ၂။ လက်ရှိ Comment ရဲ့ Data ကို ယူခြင်း
        const { data: comment, error: fetchError } = await window.supabase
            .from('comments')
            .select('*')
            .eq('id', commentId)
            .single();

        if (fetchError || !comment) return;

        const field = type === 'likes' ? 'liked_by' : 'hahaed_by';
        const countField = type === 'likes' ? 'likes' : 'hahas';

        let likedBy = comment[field] || [];
        let currentCount = comment[countField] || 0;
        let isAddingReaction = false;

        // ၃။ Reaction ရှိမရှိ စစ်ဆေးပြီး Update လုပ်ခြင်း
        if (likedBy.includes(uid)) {
            likedBy = likedBy.filter(id => id !== uid);
            currentCount = Math.max(0, currentCount - 1);
        } else {
            likedBy.push(uid);
            currentCount += 1;
            isAddingReaction = true;
        }

        // ၄။ Database ထဲသို့ Update ပြန်လုပ်ခြင်း
        const { error: updateError } = await window.supabase
            .from('comments')
            .update({ 
                [field]: likedBy, 
                [countField]: currentCount 
            })
            .eq('id', commentId);

        if (updateError) throw updateError;

        const { data: allComments } = await window.supabase
            .from('comments')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        const isAdmin = user.email === window.ADMIN_EMAIL;
        const commsContainer = document.getElementById(`comms-${postId}`);
        if (commsContainer) {
            commsContainer.innerHTML = renderComments(postId, allComments, isAdmin, uid);
        }

        if (isAddingReaction && comment.user_id && comment.user_id !== uid) {
            const reactionName = type === 'likes' ? "Like 👍" : "Haha 😆";
            const senderName = user.user_metadata.display_name || "User";
            
            queueNotification(
                comment.user_id, 
                "Reaction အသစ်ရှိပါသည်", 
                `${senderName} က သင်၏ Comment ကို ${reactionName} ပေးလိုက်ပါတယ်`,
                postId
            );
        }

    } catch (e) {
        console.error("Comment react error:", e);
    }
}
async function addComment(id) {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) return showToastMessage("Login အရင်ဝင်ပါ Senior");
    
    const inputField = document.getElementById(`in-${id}`);
    const val = inputField.value.trim();
    if (!val) return;

    const safeText = typeof escapeHtml === 'function' ? escapeHtml(val) : val;

    const user = session.user;
    const userData = currentUserData || {};

    const newComment = {
        post_id: id,
        user_id: user.id,
        user_name: typeof escapeHtml === 'function' 
                   ? escapeHtml(user.user_metadata?.display_name || "User") 
                   : (user.user_metadata?.display_name || "User"),
        is_crown: userData.is_crown || false,
        is_gold: userData.is_gold || false,
        text: safeText, // sanitized text
        likes: 0,
        liked_by: [],
        hahas: 0,
        hahaed_by: [],
        created_at: new Date().toISOString(),
        temp_id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString()
    };

    try {
        const commContainer = document.getElementById(`comms-${id}`);

const isAdmin = user.email === window.ADMIN_EMAIL;
        

        const tempHtml = renderComments(id, [newComment], isAdmin, user.id);
        if (commContainer) {
            commContainer.insertAdjacentHTML('beforeend', tempHtml);
            commContainer.scrollTop = commContainer.scrollHeight; // အောက်ဆုံးကို scroll ဆွဲမယ်
        }
        
        inputField.value = ""; // Input ကို ချက်ချင်းရှင်းမယ်

    } catch (uiError) {
        console.error("UI Update Error:", uiError);
    }

    // ၃။ Queue System ထဲ ထည့်ခြင်း
    if (!window.commentQueue) window.commentQueue = [];
    window.commentQueue.push(newComment);

    localStorage.setItem('pending_comments', JSON.stringify(window.commentQueue));
    
    console.log("✅ Comment queued (sanitized) and saved to LocalStorage.");

    if (typeof syncAllData === 'function') {
        syncAllData();
    }
}
function renderComments(postId, comments, isAdmin, currentUid) {
    // ၁။ Data မရှိရင် Empty State ပြမယ်
    if (!comments || comments.length === 0) {
        return `<div style="padding:10px; color:gray; font-size:12px;">မှတ်ချက်မရှိသေးပါ</div>`;
    }
    
    const sanitizedComments = comments.map(c => ({
        ...c,
        user_name: typeof escapeHtml === 'function' ? escapeHtml(c.user_name || 'Anonymous') : (c.user_name || 'Anonymous'),
        text: typeof escapeHtml === 'function' ? escapeHtml(c.text || '') : (c.text || '')
    }));
    
    // ၃။ Comments များကို ပိုင်းခြားခြင်း (ပထမ ၅ ခုနှင့် ကျန်တာ)
    const initialComments = sanitizedComments.slice(0, 5);
    const extraComments = sanitizedComments.slice(5);
    
    // ၄။ HTML တည်ဆောက်ခြင်း
    let html = '';
    
    // ပထမ ၅ ခုကို ထည့်မယ်
    if (initialComments.length > 0) {
        html += initialComments.map(c => 
            renderCommentHTML(c, isAdmin, currentUid, postId)
        ).join('');
    }
    
    // ၅။ See More Logic (၅ ခုထက်ပိုရင်)
    if (sanitizedComments.length > 5) {
        const extraHtml = extraComments.map(c => 
            renderCommentHTML(c, isAdmin, currentUid, postId)
        ).join('');
        
        const remainingCount = sanitizedComments.length - 5;
        const buttonText = remainingCount > 0 ? `View ${remainingCount} more comments...` : 'No more comments';
        
        html += `
            <div id="extra-comms-${postId}" style="display:none;">
                ${extraHtml}
            </div>
            <div id="more-btn-${postId}" 
                 onclick="showAllComments('${postId}')" 
                 style="color:var(--primary-color, purple); font-size:13px; cursor:pointer; padding:8px 0; font-weight:600; text-align:center;">
                 📝 ${buttonText}
            </div>`;
    }
    
    return html;
}

function showAllComments(postId) {
    const extraDiv = document.getElementById(`extra-comms-${postId}`);
    const moreBtn = document.getElementById(`more-btn-${postId}`);
    
    if (!extraDiv) {
        console.warn(`⚠️ extra-comms-${postId} not found`);
        return;
    }
    
    extraDiv.style.display = 'block';
    extraDiv.style.opacity = '0';
    extraDiv.style.transition = 'opacity 0.25s ease-in-out';
    
    setTimeout(() => {
        extraDiv.style.opacity = '1';
    }, 10);
    
    if (moreBtn) {
        moreBtn.style.display = 'none';
    }
    
    console.log(`✅ All comments shown for post: ${postId}`);
}
function renderCommentHTML(c, isAdminFromProfile, currentUid, postId) {
    // ၁။ Data Extraction & Fallbacks
    const commentId = String(c.id);
    const userId = c.user_id;
    const content = c.content || c.text || ''; // naming နှစ်မျိုးလုံးအတွက်
    const userName = c.profiles?.username || c.user_name || 'Anonymous';
    
    // ၂။ Security: XSS ကာကွယ်ရန် Escape လုပ်ခြင်း
    const safeUserName = escapeHtml(userName);
    const safeContent = escapeHtml(content);
    const encodedContent = encodeURIComponent(content); // toggleText အတွက် encoding လုပ်ထားခြင်း
    
    // ၃။ Logic Checks (Admin သို့မဟုတ် ပိုင်ရှင်ဖြစ်ပါက ဖျက်ခွင့်ပေးမည်)
    const isOwner = userId === currentUid;
    const canDelete = isAdminFromProfile || isOwner;
    
    // ၄။ See More/Less Logic (စာလုံးရေ ၂၀၀ ကျော်ပါက)
    const limit = 200;
    const isLongText = content.length > limit;
    const displayContent = isLongText ? safeContent.substring(0, limit) : safeContent;

    // ၅။ Language & Reactions
    const lang = localStorage.getItem('app_lang') || 'mm';
    const deleteText = lang === 'en' ? 'Delete' : 'ဖျက်မည်';
    const likes = Number(c.likes) || 0;
    const hahas = Number(c.hahas) || 0;

    // ID များကို selector အဖြစ်သုံးနိုင်အောင် escape လုပ်ခြင်း
    const escapedPostId = String(postId).replace(/'/g, "\\'");
    const escapedCommentId = commentId.replace(/'/g, "\\'");

    return `
    <div class="comment-item" id="comment-${commentId}" 
         style="margin-bottom:10px; background:#f0f2f5; padding:10px 14px; border-radius:18px; position:relative;">
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
            <div style="font-weight:bold; font-size:13px; color:purple; display:flex; align-items:center; gap:5px;">
                ${safeUserName}
                ${isAdminFromProfile ? '<span style="background:#8e44ad; color:white; font-size:9px; padding:1px 5px; border-radius:4px;">Admin</span>' : ''}
            </div>
            
            ${canDelete ? `
                <span onclick="deleteComment('${escapedCommentId}', '${escapedPostId}')" 
                      style="color:#e74c3c; cursor:pointer; font-size:11px; font-weight:bold; padding:4px 8px; border-radius:12px; background:#fee; transition:all 0.2s;">
                    🗑️ ${deleteText}
                </span>
            ` : ""}
        </div>
        
        <div style="font-size:13px; word-break:break-word; line-height:1.4; color:#1c1e21;">
            <span id="text-content-${commentId}">${displayContent}</span>
            ${isLongText ? `
                <button id="btn-${commentId}" class="btn-link" 
                        style="background:none; border:none; color:#1877f2; cursor:pointer; font-size:12px; padding:0; font-weight:600;"
                        onclick="toggleText('${commentId}', '${encodedContent}')">... See More</button>
            ` : ''}
        </div>
        
        <div style="display:flex; gap:15px; margin-top:8px; font-size:12px; color:#65676b;">
            <div onclick="reactComment('${escapedPostId}', '${escapedCommentId}', 'likes')" 
                 style="cursor:pointer; display:inline-flex; align-items:center; gap:4px; font-weight:500;">
                 👍 <span>${likes}</span>
            </div>
            <div onclick="reactComment('${escapedPostId}', '${escapedCommentId}', 'hahas')" 
                 style="cursor:pointer; display:inline-flex; align-items:center; gap:4px; font-weight:500;">
                 😆 <span>${hahas}</span>
            </div>
        </div>
    </div>`;
}

function renderPostHTML(id, d, uid, isAdmin, targetTable = 'posts') {
    const mUrls = d.media_urls || d.mediaUrls || [];
    const mType = d.media_type || d.mediaType || "";
    const createdAt = d.created_at || d.createdAt;
    const isPinned = d.is_pinned || d.isPinned || false;
    
    const isLiked = (d.liked_by || []).includes(uid);
    const isHahaed = (d.hahaed_by || []).includes(uid);
    const timeDisplay = typeof formatTime === "function" ? formatTime(createdAt) : "Just now";

    // --- TEXT ESCAPING & TRUNCATING ---
    const textContent = d.text || "";
    // escapeHtml function ရှိမရှိ စစ်ပြီး text ကို escape လုပ်ပါသည်
    const safeText = typeof escapeHtml === 'function' ? escapeHtml(textContent) : textContent;
    
    const isLongText = safeText.length > 200;
    const initialText = isLongText ? safeText.substring(0, 200) : safeText;
    
    const textHTML = `
        <div id="text-container-${id}" style="margin:5px 0 10px 0; white-space:pre-wrap; font-size:14px; color:#333; line-height:1.5;">
            <span id="text-content-${id}">${initialText}</span>
            ${isLongText ? `<span id="btn-${id}" style="color:purple; font-weight:bold; cursor:pointer; font-size:13px;" onclick="toggleText('${id}', \`${encodeURIComponent(textContent)}\`)">... See More</span>` : ""}
        </div>`;

    // --- MEDIA RENDERING ---
    let mediaHTML = "";
    const getSafeVideoUrl = (url) => {
        if (!url) return "";
        return url.includes('b-cdn.net') ? (url.includes('#t=') ? url : `${url}#t=0.001`) : url;
    };

    if (mUrls.length > 0) {
        if (mType === "video" || mUrls[0].toLowerCase().endsWith(".mp4")) {
            const videoUrl = mUrls[0];
            const posterUrl = videoUrl.includes('b-cdn.net') ? `${videoUrl}?thumbnail=true` : videoUrl;
            const safeVideo = getSafeVideoUrl(videoUrl);

            mediaHTML = `
                <div style="margin-top:10px; background:#000; border-radius:8px; overflow:hidden; position:relative;">
                    <video class="post-video" src="${safeVideo}" preload="metadata" playsinline webkit-playsinline 
                           poster="${posterUrl}" style="width:100%; display:block; min-height:200px; max-height:450px; cursor:pointer;" 
                           onclick="this.paused ? this.play() : this.pause()"></video>
                    <div class="play-icon-overlay" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); pointer-events:none; font-size:40px; color:white; opacity:0.6;">
                        <i class="fas fa-play-circle"></i>
                    </div>
                </div>`;
        } else {
            const count = mUrls.length;
            const gridClass = count >= 4 ? "grid-4" : `grid-${count}`;
            const displayCount = count > 4 ? 4 : count;

            mediaHTML = `<div class="photo-grid ${gridClass}" style="margin-top:10px;">`;
            for (let i = 0; i < displayCount; i++) {
                const isLast = (i === 3 && count > 4);
                mediaHTML += `
                    <div class="grid-item" style="position:relative; cursor:pointer;" onclick="openPhotoViewerFromId(${i}, '${id}')">
                        <img src="${mUrls[i]}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">
                        ${isLast ? `<div class="more-overlay" style="position:absolute; inset:0; background:rgba(0,0,0,0.5); color:white; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:20px; border-radius:4px;">+${count - 3}</div>` : ""}
                    </div>`;
            }
            mediaHTML += `</div>`;
        }
    }

    // --- UI RETURN ---
    return `
    <div class="post-card" id="post-${id}" data-id="${id}" style="background:white; border-radius:12px; padding:15px; margin-bottom:15px; box-shadow:0 2px 8px rgba(0,0,0,0.1); border: ${isPinned ? '2px solid #6A1B9A' : 'none'};">
        
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
                <b style="color:purple; font-size:15px;">
                    ${typeof getDisplayNameWithBadge === 'function' ? getDisplayNameWithBadge(d) : (d.author || d.display_name || 'User')}
                </b>
                <small style="color:gray; font-size:11px;">${timeDisplay}</small>
            </div>
            <div style="display:flex; gap:12px;">
                ${isAdmin ? `
                    <button onclick="togglePin('${id}', ${isPinned})" style="border:none; background:none; cursor:pointer; font-size:16px;">${isPinned ? "📌" : "📍"}</button>
                    <button onclick="deletePost('${id}')" style="border:none; background:none; cursor:pointer; font-size:16px;">🗑️</button>
                ` : ""}
            </div>
        </div>

        ${textHTML} 
        ${mediaHTML}

        <div style="display:flex; justify-content:space-between; margin-top:12px; border-top:1px solid #f0f0f0; padding-top:10px;">
            <div style="display:flex; gap:18px;">
                <span onclick="handleReact('${id}','likes',event,'${targetTable}')" style="cursor:pointer; font-weight:bold; color:${isLiked ? "#1877F2" : "#65676B"}; font-size:14px;">
                    👍 <span>${d.likes || 0}</span>
                </span>
                <span onclick="handleReact('${id}','hahas',event,'${targetTable}')" style="cursor:pointer; font-weight:bold; color:${isHahaed ? "#F7B125" : "#65676B"}; font-size:14px;">
                    😆 <span>${d.hahas || 0}</span>
                </span>
            </div>
            <div style="font-size:12px; color:gray;">
                👁️ ${d.views || 0} | <span onclick="handleShare('${id}')" style="cursor:pointer; color:purple; font-weight:bold;">🚀 Share</span>
            </div>
        </div>

        <div style="margin-top:10px; background:#f9f9f9; border-radius:8px; padding:5px;">
            <div id="comms-${id}" style="max-height:300px; overflow-y:auto;">
                ${typeof renderComments === "function" ? renderComments(id, d.comments || [], isAdmin, uid) : ""}
            </div>
            <div style="display:flex; gap:8px; margin-top:8px; padding:5px;">
                <input type="text" id="in-${id}" placeholder="မှတ်ချက်ပေးပါ..." 
                    style="flex:1; border-radius:20px; border:1px solid #ddd; padding:10px 15px; font-size:13px; outline:none;" 
                    onkeypress="if(event.key === 'Enter') addComment('${id}')">
                <button onclick="addComment('${id}')" style="background:purple; color:white; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">➤</button>
            </div>
        </div>
    </div>`;
}

async function togglePin(id, currentStatus) { 
    try {
        // ၁။ Supabase မှာ Update လုပ်မယ်
        const { error } = await window.supabase
            .from(window.MAIN_POST_TABLE || 'posts')
            .update({ is_pinned: !currentStatus })
            .eq('id', id);

        if (error) throw error;

        if (typeof refreshFeed === 'function') {
            await refreshFeed(); 
        } else if (typeof loadPosts === 'function') {
            await loadPosts(window.MAIN_POST_TABLE, false);
        } else {
            location.reload();
        }

        // ၃။ အောင်မြင်ကြောင်း Feedback ပေးမယ်
        const msg = !currentStatus ? "📌 ပို့စ်ကို Pin ထိုးလိုက်ပါပြီ" : "📍 Pin ကို ဖြုတ်လိုက်ပါပြီ";
        if (typeof showToastMessage === 'function') {
            showToastMessage(msg);
        }
        console.log(msg);

    } catch (e) {
        console.error("Pin error:", e.message);
        if (typeof showToastMessage === 'function') {
            showToastMessage("Pin လုပ်လို့မရပါ");
        }
    }
}

function previewMedia(input) {
    const box = document.getElementById('mediaPreviewBox');
    if (!box) return;

    const newFiles = Array.from(input.files);
    const MAX_FILES = 10;

    newFiles.forEach(file => {
        selectedFiles.push(file);
    });

    // ၂။ စုစုပေါင်းအရေအတွက်ကို စစ်ဆေးမယ်
    if (selectedFiles.length > MAX_FILES) {
        showToastMessage(`Senior ရေ... စုစုပေါင်း ${MAX_FILES} ပုံထက် ပိုတင်လို့မရပါဘူး။`);
        
        selectedFiles = selectedFiles.slice(0, MAX_FILES);
    }

    renderPreview();

    input.value = "";
}

function renderPreview() {
    const box = document.getElementById('mediaPreviewBox');
    box.innerHTML = ""; // အရင်ရှိတာတွေ ရှင်းထုတ်ပြီး အသစ်ပြန်ဆွဲမယ်

    if (selectedFiles.length > 0) {
        box.style.display = 'grid';
        box.style.gridTemplateColumns = 'repeat(auto-fill, minmax(80px, 1fr))';
        box.style.gap = '8px';
        box.style.padding = '10px';

        selectedFiles.forEach((file, index) => {
            const url = URL.createObjectURL(file);
            let mediaElement;

            // Video သို့မဟုတ် Image ပုံဖော်ခြင်း
            const isVideo = file.type.startsWith('video/');
            const iconHtml = isVideo ? `<div class="absolute inset-0 flex items-center justify-center bg-black/20"><i class="fas fa-play text-white text-xs"></i></div>` : '';

            mediaElement = `
                <div class="relative group" style="width:100%; height:80px;">
                    ${isVideo 
                        ? `<video src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;"></video>`
                        : `<img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:8px; border: 1px solid #ddd;">`
                    }
                    ${iconHtml}
                    <button type="button" onclick="removeSingleFile(${index})" 
                        class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-lg hover:bg-red-600 transition z-10">
                        ×
                    </button>
                </div>`;
            
            box.insertAdjacentHTML('beforeend', mediaElement);
        });
    } else {
        box.style.display = 'none';
    }
}
// Function တစ်ခုတည်းပဲ ထားပါ Senior
function removeSingleFile(index) {
    selectedFiles.splice(index, 1);

    const input = document.getElementById('mediaInput');
    if (input) {
        const dt = new DataTransfer();
        selectedFiles.forEach(file => dt.items.add(file));
        input.files = dt.files;
    }

    renderPreview();
    
    if (selectedFiles.length === 0) {
        const box = document.getElementById('mediaPreviewBox');
        if (box) box.style.display = 'none';
    }
}
function clearPreview() {
    const box = document.getElementById('mediaPreviewBox');
    const mediaInput = document.getElementById('mediaInput');

    if (box) {
        const mediaElements = box.querySelectorAll('img, video');
        mediaElements.forEach(item => {
            if (item.src && item.src.startsWith('blob:')) {
                URL.revokeObjectURL(item.src);
            }
        });

        box.style.display = 'none';
        box.innerHTML = '';
    }

    if (mediaInput) {
        mediaInput.value = '';
    }
}

function viewFullImage(imgSrc) {
    if (!imgSrc) return;

    const newWindow = window.open();
    if (newWindow) {
        newWindow.opener = null; // Security link ဖြတ်တောက်ခြင်း
        newWindow.location = imgSrc;
    } else {
        showToastMessage("Pop-up ကို ခွင့်ပြုပေးပါ");
    }
}
async function saveInitialName() {
    const nameElement = document.getElementById('setupUserName');
    if (!nameElement) return;

    const { data: { session } } = await window.supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
        showToastMessage("ကျေးဇူးပြု၍ Login အရင်ဝင်ပါ။");
        if (typeof showPhoneLogin === 'function') showPhoneLogin();
        return;
    }

    let inputName = nameElement.value.trim();
    
    // ၂။ Validation (စစ်ဆေးမှုများ)
    if (!inputName || inputName.length < 2) {
        nameElement.style.border = "2px solid red";
        nameElement.focus();
        return showToastMessage("အမည်သည် အနည်းဆုံး ၂ လုံး ရှိရပါမည်။");
    }
    
    if (inputName.length > 12) {
        nameElement.style.border = "2px solid red";
        nameElement.focus();
        return showToastMessage("အမည်ကို အများဆုံး ၁၂ လုံးသာ ခွင့်ပြုထားပါတယ်။");
    }
    
    if (typeof isSafeName === 'function' && !isSafeName(inputName)) {
        nameElement.style.border = "2px solid red";
        nameElement.focus();
        return showToastMessage("မြန်မာစာ၊ အင်္ဂလိပ်စာနဲ့ ဂဏန်းများသာ ထည့်နိုင်ပါသည်။");
    }

    // ၃။ UI Loading ပြောင်းလဲခြင်း
    const saveButton = document.querySelector('#nameSetupModal button');
    const originalButtonText = saveButton ? saveButton.innerText : "အတည်ပြုမည်";
    
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.innerText = "စစ်ဆေးနေသည်...";
    }

    try {
        let finalDisplayName = inputName;
                const { data: existingUsers, error: checkError } = await window.supabase
            .from('profiles') 
            .select('id, display_name')
            .eq('display_name', inputName)
            .limit(1);

        if (checkError) throw checkError;

        if (existingUsers && existingUsers.length > 0 && existingUsers[0].id !== user.id) {
            const randomSuffix = Math.floor(1000 + Math.random() * 9000); 
            finalDisplayName = `${inputName}_${randomSuffix}`;
            
            if (finalDisplayName.length > 15) { 
                finalDisplayName = `${inputName.substring(0, 8)}_${randomSuffix}`;
            }
        }

        const safeName = typeof escapeHtml === 'function' ? escapeHtml(finalDisplayName) : finalDisplayName;

        if (saveButton) saveButton.innerText = "သိမ်းဆည်းနေသည်...";

        const { error: dbUpdateError } = await window.supabase
            .from('profiles')
            .update({
                display_name: safeName, // sanitized name
                is_profile_setup: true,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

        if (dbUpdateError) throw dbUpdateError;

        await window.supabase.auth.updateUser({
            data: { display_name: safeName }
        });

        // ၇။ UI Updates
        const userNameDisplay = document.getElementById('userNameDisplay');
        if (userNameDisplay) {
            userNameDisplay.textContent = safeName;
        }

        const modal = document.getElementById('nameSetupModal');
        if (modal) modal.style.display = 'none';

        showToastMessage(`"${safeName}" အဖြစ် သိမ်းဆည်းလိုက်ပါပြီ Senior!`, "success");

    } catch (error) {
        console.error("❌ Error saving name:", error);
        showToastMessage("နာမည်သိမ်းခြင်း မအောင်မြင်ပါ: " + (error.message || ""));
        nameElement.style.border = "2px solid red";
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerText = originalButtonText;
        }
    }
}

function showToastMessage(message, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 30px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
    }
    
    const colors = {
        success: '#2ecc71', // အစိမ်း
        error: '#e74c3c',   // အနီ
        info: '#3498db',    // အပြာ
        warning: '#f1c40f'  // အဝါ
    };

    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${colors[type] || colors.info};
        color: white;
        padding: 12px 20px;
        border-radius: 25px;
        margin-bottom: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        font-size: 14px;
        font-family: sans-serif;
        font-weight: 500;
        text-align: center;
        min-width: 250px;
        max-width: 85%;
        word-break: break-word;
        opacity: 0;
        transform: translateY(-20px);
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);

    // Fade in animation
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);
    
    // ၃ စက္ကန့်အကြာမှာ ပျောက်သွားအောင်လုပ်ခြင်း
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => {
            if (toastContainer.contains(toast)) {
                toastContainer.removeChild(toast);
            }
        }, 400);
    }, 3000);
}

async function deleteComment(commentId, postId) {
    if (!confirm("ဖျက်မှာလား?")) return;
    
    const { error } = await window.supabase
        .from('comments')
        .delete()
        .eq('id', commentId);
    
    if (error) {
        console.error("Delete error:", error);
    } else {
        // Comment ပြန် render လုပ်
        const { data: comments } = await window.supabase
            .from('comments')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });
            
        const { data: { session } } = await window.supabase.auth.getSession();
        const isAdmin = session?.user?.email === window.ADMIN_EMAIL;
        
        document.getElementById(`comms-${postId}`).innerHTML = 
            renderComments(postId, comments, isAdmin, session?.user?.id);
    }
}
const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const video = entry.target;
        if (entry.intersectionRatio < 0.3) {
            video.pause();
        } else {
            video.muted = true;
            video.play().catch(e => console.log("Auto play blocked:", e));
            
            if (!video.dataset.hasListener) {
                video.addEventListener('click', () => {
                    video.muted = !video.muted;
                    if (video.paused) video.play();
                });
                video.dataset.hasListener = "true";
                video.style.cursor = "pointer";
            }
        }
    });
}, { threshold: [0,0.3, 0.7] });

function initObservers() {
    setTimeout(() => {
        document.querySelectorAll('.post-video').forEach(video => {
            videoObserver.observe(video);
        });

        document.querySelectorAll('.post-card').forEach(post => {
            if (window.postViewObserver) {
                window.postViewObserver.observe(post);
            }
        });
        
        console.log("🎯 Observers initialized for videos and posts!");
    }, 500);
}

async function startLiveNotifications() {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) return;
    
    const user = session.user;
    const myUid = user.id;
    const defaultLogo = 'https://i.ibb.co/Xx3yHt2y/lastlogo.png';
    const myIcon = user.user_metadata?.avatar_url || defaultLogo;

    const notificationSubscription = window.supabase
        .channel('realtime-notifications')
        .on(
            'postgres_changes', 
            { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'notifications',
                filter: `receiver_id=eq.${myUid}` 
            }, 
            async (payload) => {
                const notif = payload.new;

                if (notif.status === 'unread') {
                    
                    if (Notification.permission === "granted") {
                        const n = new Notification(notif.title || "အသိပေးချက်", {
                            body: notif.body || "",
                            icon: myIcon,
                            badge: defaultLogo,
                            tag: notif.id, 
                            data: { post_id: notif.post_id }
                        });

                                      n.onclick = async function(e) {
                            e.preventDefault();
                            window.focus();

    await markAsRead(notif.id);

                            const postId = this.data.post_id;
                            if (postId) {
                                let targetPost = document.querySelector(`[data-id="${postId}"]`);
                                
                                if (!targetPost) {
                                    console.log("Post not found in DOM, refreshing...");
                                    if (typeof refreshPosts === 'function') {
                                        await refreshPosts(); // Table name ကို သတိထားပါ
                                        
                                        // DOM render ဖြစ်ဖို့ ခဏစောင့်ပြီးမှ ရှာမယ်
                                        setTimeout(() => {
                                            const newlyLoadedPost = document.querySelector(`[data-id="${postId}"]`);
                                            if (newlyLoadedPost) {
                                                newlyLoadedPost.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                highlightPost(newlyLoadedPost);
                                            }
                                        }, 800);
                                    }
                                } else {
                                    // ပို့စ်ရှိရင် တိုက်ရိုက်သွားမယ်
                                    targetPost.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    highlightPost(targetPost);
                                }
                            }
                            n.close();
                        };


                    }

                    await window.supabase
                        .from('notifications')
                        .update({ status: 'read' })
                        .eq('id', notif.id);

                    if (typeof updateNotificationBadge === 'function') {
                        updateNotificationBadge();
                    }
                }
            }
        )
        .subscribe();
}

function highlightPost(el) {
    el.style.transition = "background 1s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    el.style.background = "#fff9c4"; // အဝါနုရောင်
    setTimeout(() => {
        el.style.background = "white";
    }, 2500);
}
async function markAsRead(notificationId) {
    const { error } = await window.supabase
        .from('notifications')
        .update({ status: 'read' })
        .eq('id', notificationId);
    
    if (error) console.error("Mark as read error:", error);
    if (typeof updateNotificationBadge === 'function') updateNotificationBadge();
}
async function updateNotificationBadge() {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) return;

    const myUid = session.user.id;

    const { count, error } = await window.supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', myUid)
        .eq('status', 'unread');

    if (error) return console.error("Badge error:", error);

    const badge = document.getElementById('notif-badge');
    if (badge) {
        if (count > 0) {
            badge.innerText = count > 9 ? "9+" : count;
            badge.style.display = "flex"; // အနီရောင်စက်ဝိုင်းလေး ပြမယ်
        } else {
            badge.style.display = "none"; // ၀ ဆိုရင် ဖျောက်ထားမယ်
        }
    }
}
window.showToastMessage = window.showToastMessage || function(msg, type) {
    console.log(`[${type || 'info'}] ${msg}`);
    alert(msg); // temporary fallback
};
async function checkBanStatus(uid, deviceId) {
    if (!uid) return false;

    try {

        const { data, error } = await window.supabase
            .from('banned_users')
            .select('*')
            .or(`uid.eq.${uid},device_id.eq.${deviceId}`)
            .maybeSingle(); 

        if (error) {
            console.error("Ban check error:", error.message);
            return false;
        }

        if (data) {
            const reason = data.reason || "စည်းကမ်းဖောက်ဖျက်မှုကြောင့်";
            showToastMessage(`🚫 သင့်အကောင့်သည် ပိတ်ပင်ခံထားရပါသည် Senior။\nအကြောင်းပြချက်: ${reason}`);
            return true;
        }

        return false;
    } catch (e) {
        console.error("Ban check exception:", e);
        return false;
    }
}
window.photoList = [];
window.currentIndex = 0;

window.openPhotoViewer = function(index, photosJson) {
    try {
        let rawData = decodeURIComponent(photosJson);
        let parsedData = JSON.parse(rawData);
        
        window.photoList = Array.isArray(parsedData) ? parsedData : [parsedData];
        window.currentIndex = index;

        const viewer = document.getElementById("photoViewer");
        const img = document.getElementById("activeImg");

        if (viewer && img) {
            viewer.style.display = "flex";
            
            img.style.opacity = "0.5"; 
            img.src = window.photoList[window.currentIndex];

            img.onload = () => {
                img.style.opacity = "1";
                img.style.transition = "opacity 0.3s ease";
            };

            img.onerror = () => {
                img.src = 'https://i.ibb.co/Xx3yHt2y/lastlogo.png';
                if (typeof showToastMessage === "function") {
                    showToastMessage("ပုံကို ဆွဲထုတ်လို့ မရပါဘူး", "error");
                }
            };

            if (typeof updatePhotoCount === "function") {
                updatePhotoCount();
            }
        }
    } catch (e) {
        console.error("❌ Photo Viewer Error:", e);
        if (typeof showToastMessage === "function") {
            showToastMessage("Photo Viewer ဖွင့်လို့မရပါဘူး", "error");
        }
    }
};

async function syncShares() {
    if (window.shareQueue.length === 0) return;

    const processingShares = [...window.shareQueue];
    for (const item of processingShares) {
        try {
            const { error } = await window.supabase.from('shares').insert(item);
            
            if (!error) {
                await window.supabase.rpc('increment_post_share', { post_id_input: item.post_id });
                
                // ၃။ Queue ထဲကနေ ဖယ်ထုတ်မယ်
                const idx = window.shareQueue.indexOf(item);
                if (idx > -1) window.shareQueue.splice(idx, 1);
            }
        } catch (e) {
            console.error("Share sync error for item:", e);
        }
    }
    localStorage.setItem('pending_shares', JSON.stringify(window.shareQueue));
}

async function syncAllData() {
    if (!navigator.onLine || window.isSyncing) return;

    const viewEntries = Object.entries(window.viewQueue || {});
    const hasData = [
        window.reactionQueue, 
        window.commentQueue, 
        window.shareQueue, 
        window.notifQueue
    ].some(q => q?.length > 0) || viewEntries.length > 0;

    if (!hasData) return;

    window.isSyncing = true;
    const MAX_RETRIES = 3;
    console.log("🔄 Global Syncing started...");

    try {
        const tasks = [];

        if (viewEntries.length > 0) {
            for (const [pid, count] of viewEntries) {
                const { error } = await window.supabase.rpc('increment_post_view', { 
                    post_id_input: pid,
                    inc_value: count 
                });
                if (!error) delete window.viewQueue[pid];
            }
        }

        if (window.reactionQueue?.length > 0) {
            const reactionTasks = window.reactionQueue.map(async (item) => {
                const { error } = await window.supabase.rpc('toggle_reaction', {
                    p_post_id: item.post_id,
                    p_user_id: item.user_id, 
                    p_reaction_type: item.type,
                    p_action_type: item.action,
                    p_table_name: item.table_name || 'posts'
                });
                return { item, success: !error || error.code === '23505' };
            });

            const results = await Promise.all(reactionTasks);
            window.reactionQueue = results
                .filter(res => !res.success)
                .map(res => res.item);
        }

        if (window.commentQueue?.length > 0) {
            const remainingComments = [];
            for (let item of window.commentQueue) {
                const insertData = item.data || item;
                const { error } = await window.supabase.from('comments').insert(insertData);

                if (error && error.code !== '23505') {
                    item.retryCount = (item.retryCount || 0) + 1;
                    if (item.retryCount < MAX_RETRIES) remainingComments.push(item);
                }
            }
            window.commentQueue = remainingComments;
        }

        if (window.notifQueue?.length > 0) {
            const remainingNotifs = [];
            for (let n of window.notifQueue) {
                const { error } = await window.supabase.from('notifications').insert(n);
                if (error && error.code !== '23505') {
                    n.retryCount = (n.retryCount || 0) + 1;
                    if (n.retryCount < MAX_RETRIES) remainingNotifs.push(n);
                }
            }
            window.notifQueue = remainingNotifs;
        }

        if (window.shareQueue?.length > 0) {
            const shareResults = await Promise.all(window.shareQueue.map(async (s) => {
                const { error } = await window.supabase.rpc('increment_share_count', { 
                    post_id_input: s.post_id,
                    p_table_name: s.table_name || 'posts'
                });
                return { item: s, success: !error };
            }));
            window.shareQueue = shareResults.filter(r => !r.success).map(r => r.item);
        }

    } catch (err) {
        console.error("Critical Sync Failure:", err);
    } finally {
        if (typeof saveAllQueuesToLocal === 'function') {
            saveAllQueuesToLocal();
        }
        window.isSyncing = false;
        console.log("🏁 Sync Process Finished.");
    }
}

function saveAllQueuesToLocal() {
    const dataMap = {
        'view_queue': window.viewQueue || {},
        'pending_reactions': window.reactionQueue || [],
        'pending_comments': window.commentQueue || [],
        'pending_notifications': window.notifQueue || [],
        'pending_shares': window.shareQueue || []
    };

    try {
        Object.entries(dataMap).forEach(([key, val]) => {

            const hasData = Array.isArray(val) 
                ? val.length > 0 
                : (val && typeof val === 'object' && Object.keys(val).length > 0);

            if (hasData) {
                const stringifiedData = JSON.stringify(val);
                localStorage.setItem(key, stringifiedData);
            } else {
                localStorage.removeItem(key);
            }
        });
        
        console.log("💾 All queues successfully backed up.");
    } catch (error) {
        console.error("❌ Critical Storage Error:", error);
    }
}

function saveQueueToLocalStorage() {
    if (window.commentQueue) {
        localStorage.setItem('pending_comments', JSON.stringify(window.commentQueue));
    }
}

const SYNC_TIME_MS = 5 * 60 * 1000; // 5 Minutes

const performAutoSync = () => {
    if (navigator.onLine) {
        console.log("Syncing data...");
        syncAllData();
    } else {
        console.warn("Sync skipped: No internet connection.");
    }
};

window.addEventListener('online', performAutoSync);

if (!window.syncInterval) {
    window.syncInterval = setInterval(performAutoSync, SYNC_TIME_MS);
}

window.addEventListener('beforeunload', () => {
    if (window.syncInterval) {
        clearInterval(window.syncInterval);
        window.syncInterval = null;
        console.log("Sync interval cleared.");
    }
});

window.changeSlide = function(direction) {
    if (!window.photoList || window.photoList.length === 0) return;

    window.currentIndex += direction;
    if (window.currentIndex < 0) window.currentIndex = window.photoList.length - 1;
    if (window.currentIndex >= window.photoList.length) window.currentIndex = 0;

    const img = document.getElementById("activeImg");
    if (img) {
        // ၃။ ပုံအသစ်မပေါ်ခင် ခေတ္တမှိန်ပြမယ်
        img.style.opacity = "0.5";

        img.src = window.photoList[window.currentIndex];

        img.onload = () => {
            img.style.opacity = "1";
        };

        img.onerror = () => {
            img.src = 'https://i.ibb.co/Xx3yHt2y/lastlogo.png';
        };
    }

    if (typeof updatePhotoCount === 'function') {
        updatePhotoCount();
    }
};
function updatePhotoCount() {
    const countElement = document.getElementById("photoCount");
    if (countElement && window.photoList) {
        countElement.innerText = `${window.currentIndex + 1} / ${window.photoList.length}`;
    }
}

window.closePhotoViewer = function() {
    const viewer = document.getElementById("photoViewer");
    if (viewer) {
        viewer.style.display = "none";

    }
};

// ၁။ HTML Escape Function (အရှေ့မှာ ပေါင်းပေးထားတဲ့ Version)
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

// ၂။ Translations Object (တစ်ခုတည်းပဲ ထားပါ)
const translations = {
    mm: {
        see_more: "... See More",
        show_less: " Show Less",
        // ... အခြား translation များ
    },
    en: {
        see_more: "... See More",
        show_less: " Show Less",
        // ... အခြား translation များ
    }
};

window.toggleText = function(id, fullTextEncoded) {
    const fullText = decodeURIComponent(fullTextEncoded);
    const contentSpan = document.getElementById(`text-content-${id}`);
    const btn = document.getElementById(`btn-${id}`);
    
    if (!contentSpan || !btn) return;

    // လက်ရှိ ဘာသာစကားကို စစ်ဆေးခြင်း
    const lang = window.currentLang || 'mm';
    const txtSeeMore = (typeof translations !== 'undefined' && translations[lang]?.see_more) || "... See More";
    const txtShowLess = (typeof translations !== 'undefined' && translations[lang]?.show_less) || " Show Less";


    const isExpanded = btn.getAttribute('data-expanded') === 'true';

    if (!isExpanded) {
        // Expand လုပ်မည်
        contentSpan.innerHTML = typeof escapeHtml === 'function' ? escapeHtml(fullText) : fullText;
        btn.innerText = txtShowLess;
        btn.setAttribute('data-expanded', 'true');
    } else {
        // Collapse လုပ်မည်
        const shortText = fullText.substring(0, 200);
        contentSpan.innerHTML = typeof escapeHtml === 'function' ? escapeHtml(shortText) : shortText;
        btn.innerText = txtSeeMore;
        btn.setAttribute('data-expanded', 'false');
    }
};

function applyLanguage(lang) {
    const t = translations[lang] || translations.mm; 
    const mapping = {
        't-edit-cover': t.edit_cover,
        't-post-btn': t.post_btn,
        't-apply-btn': t.apply_btn,
        't-policy-header': t.policy_header,
        't-feedback-title': t.feedback_title
    };

    for (const [id, text] of Object.entries(mapping)) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    }

    // Placeholder များအတွက်
    const postInput = document.getElementById('postContent');
    if (postInput) postInput.placeholder = t.post_placeholder;
    
    const feedbackInput = document.getElementById('feedbackMsg');
    if (feedbackInput) feedbackInput.placeholder = t.feedback_placeholder;
}

async function initLanguage() {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) {
        applyLanguage('mm'); // Login မဝင်ရသေးရင် mm ပြမယ်
        return;
    }

    const { data: profile } = await window.supabase
        .from('profiles')
        .select('language')
        .eq('id', session.user.id)
        .single();

    const userLang = profile?.language || 'mm';
    applyLanguage(userLang);
}

async function changeLanguage(newLang) {
    applyLanguage(newLang);
    
    const { data: { session } } = await window.supabase.auth.getSession();
    if (session) {
        await window.supabase
            .from('profiles')
            .update({ language: newLang })
            .eq('id', session.user.id);
    }
}

async function requestUpgrade(type, event) {
    const { data: { session } } = await window.supabase.auth.getSession();
    const user = session?.user;
    
    // ခလုတ်ကို ယူခြင်း
    const btn = event.target;
    
    const isMM = localStorage.getItem('app_lang') === 'mm' || false;
    const confirmMsg = isMM 
        ? `${type.toUpperCase()} Tier အတွက် လျှောက်ထားမှာ သေချာပါသလား Senior?` 
        : `Are you sure you want to apply for ${type.toUpperCase()} Tier?`;
    
    if (!confirm(confirmMsg)) return;

    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = isMM ? "လုပ်ဆောင်နေပါသည်..." : "Processing...";

    try {
        const { error } = await window.supabase
            .from('upgrade_requests')
            .insert([{
                uid: user.id,
                user_name: document.getElementById('userNameDisplay')?.innerText || "User",
                email: user.email,
                request_type: type, // 'gold' သို့မဟုတ် 'crown'
                status: "pending",
                created_at: new Date().toISOString()
            }]);

        if (error) throw error;

        const successMsg = isMM 
            ? "လျှောက်ထားမှု အောင်မြင်ပါသည်။ Admin အတည်ပြုချက်ကို စောင့်ဆိုင်းပေးပါ ။" 
            : "Application successful. Please wait for Admin approval.";
        
        showToastMessage(successMsg);
        btn.innerText = isMM ? "စောင့်ဆိုင်းဆဲ..." : "Pending...";
        
    } catch (e) {
        console.error("Upgrade request error:", e.message);
        ("Error: " + e.message);
        
        // Error ဖြစ်ရင် ခလုတ်ကို ပြန်ဖွင့်ပေးမယ်
        btn.disabled = false;
        btn.innerText = originalText;
    }
}
async function handleShare(postId) {
    const { data: { session } } = await window.supabase.auth.getSession();
    if (!session) return showToastMessage("Login အရင်ဝင်ပါ");

    try {
        window.shareQueue.push({
            post_id: postId,
            user_id: session.user.id,
            created_at: new Date().toISOString()
        });
        localStorage.setItem('pending_shares', JSON.stringify(window.shareQueue));
        
        const shareBtn = document.querySelector(`[data-id="${postId}"] span[onclick^="handleShare"]`);
        if (shareBtn) {
            let current = parseInt(shareBtn.innerText.match(/\d+/) || 0);
            shareBtn.innerHTML = `🚀 Share (${current + 1})`;
        }

        showToastMessage("News Feed ထဲသို့ Share လုပ်ပြီးပါပြီ Senior!");
        syncAllData(); 
    } catch (e) { console.error(e); }
}

function observePosts() {
    setTimeout(() => {
        document.querySelectorAll('.post-card').forEach(post => {
            if (window.postViewObserver) {
                window.postViewObserver.observe(post);
            }
        });
    }, 500);
}
async function sendUnlockRequest(uid, newDid, name) {
    const btn = document.getElementById('btnRequest');
    if (!btn) return;

    btn.disabled = true;
    btn.innerText = "ခဏစောင့်ပါ...";

    try {
        console.log(`Alert: User ${name} (${uid}) is requesting unlock for device ${newDid}`);
        
        if (window.ADMIN_BACKUP) {
            console.log("Contacting Backup Admin:", window.ADMIN_BACKUP);
        }

        alert(`မင်္ဂလာပါ ${name}၊\nDeveloper ထံသို့ Unlock Request ပို့ပြီးပါပြီ။ Admin က အတည်ပြုပြီးပါက ပြန်လည်အသုံးပြုနိုင်ပါပြီ။`);
        
        await window.supabase.auth.signOut();
        location.reload();
        
    } catch (e) {
        console.error(e);
        if (typeof showToastMessage === 'function') {
            showToastMessage("Request ပို့လို့မရပါဘူး Senior");
        } else {
            alert("Request ပို့လို့မရပါဘူး။");
        }
        btn.disabled = false;
        btn.innerText = "ပြန်ပို့မည်";
    }
}
window.postViewObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const postId = entry.target.getAttribute('data-id');
            if (postId && !entry.target.dataset.viewCounted) {
                incrementView(postId);
                entry.target.dataset.viewCounted = 'true';
            }
        }
    });
}, { threshold: 0.5 });
window.supabase.auth.onAuthStateChange((event, session) => {
    if (session) syncAllData();
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        syncAllData();
    }
});

const postActions = {
    uploadAndPost,
    addComment,
    reactComment,
    deleteComment,
    handleReact,
    handleShare,
    deletePost,
    togglePin,
    previewMedia,
    clearPreview,
    viewFullImage,
    incrementView,
    saveInitialName,
    showAllComments,
    openPhotoViewerFromId,
    startLiveNotifications,
    updateNotificationBadge,
    checkFriendStatus,
    addFriendUser,
    unfriendUser,
    syncAllData,
    loginWithGoogle,
    sendOTP,
    verifyOTP,
    showPhoneLogin,
    closePhoneLogin,
    toggleText
};

const postLoading = {
    loadMorePosts,
    cleanupPosts,
    refreshPosts,
    observePosts
};

window.videoObserver = typeof videoObserver !== 'undefined' ? videoObserver : null;
window.allPosts = [];

Object.assign(window, postActions, postLoading);

})();

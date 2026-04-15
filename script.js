const TARGET_TABLE = window.MAIN_POST_TABLE || 'posts';

// Environment Variables အားလုံးကို အစားထိုးပြီးသား code ဖြစ်ပါသည်။
const supabaseUrl = "https://oktdmqfgqmhipbpbtnbl.supabase.co";
const supabaseKey = "Sb_publishable_4XuF6Eak9wsVtl1npgIyFA_xRlK8x3S";

if (supabaseUrl && supabaseKey) {
    window.supabase = createClient(supabaseUrl, supabaseKey);
} else {
    console.error("Supabase Keys များ ပျောက်ဆုံးနေပါသည်။ Cloudflare Settings ကို စစ်ဆေးပါ။");
}

(function() {
    const checkFP = async () => {
        if (typeof FingerprintJS === 'undefined') {
            console.warn("FingerprintJS not loaded yet, retrying...");
            setTimeout(checkFP, 500); 
            return;
        }

        try {
            if (!window.fpAgent) {
                window.fpAgent = await FingerprintJS.load();
                console.log("✅ FingerprintJS Ready!");
            }
        } catch (e) {
            console.error("FP Load Error:", e);
        }
    };

    checkFP();

    window.isSyncing = false;
    window.addEventListener('online', syncAllData);
    
    // Global Variables & Queues
    window.reactionQueue = JSON.parse(localStorage.getItem('pending_reactions') || '[]');
    window.commentQueue = JSON.parse(localStorage.getItem('pending_comments') || '[]');
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

    // Environment Variables အစစ်များ ထည့်သွင်းခြင်း
    window.ADMIN_EMAIL = "uwinkyawdevelopbusinessco@gmail.com";
    window.ADMIN_BACKUP = "toetetye777@gmail.com"; // Backup email ပါ ထည့်ပေးထားပါတယ်
    
    const BUNNY_KEY = "a038d7e1-bf94-448b-b863c156422e-7e4a-4299";
    const BUNNY_STORAGE = "public-hospitals";
    const IMGBB_KEY = "C8d8d00185e973ebcafddd34f77a1176";

    // တခြား လိုအပ်တဲ့ API variables တွေကိုလည်း global scope မှာ သုံးနိုင်အောင် လုပ်ထားနိုင်ပါတယ်
    window.BUNNY_CONFIG = {
        key: BUNNY_KEY,
        storage: BUNNY_STORAGE
    };
    window.IMGBB_API_KEY = IMGBB_KEY;
// --- Auth Functions ---
async function loginWithGoogle() {
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin }
        });
        if (error) throw error;
    } catch (error) {
        alert("Login Error: " + error.message);
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
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) throw error;
        document.getElementById('otpSection').style.display = 'block';
        alert("OTP ပို့ပြီးပါပြီ");
    } catch (error) {
        alert("Error: " + error.message);
    }
}

async function verifyOTP() {
    const phone = "+959" + document.getElementById('phoneNumber').value.trim();
    const token = document.getElementById('otpCode').value.trim();
    try {
        const { error } = await supabase.auth.verifyOtp({
            phone, token, type: 'sms'
        });
        if (error) throw error;
        closePhoneLogin();
        alert("Login အောင်မြင်ပါတယ်");
    } catch (error) {
        alert("OTP မှားနေပါတယ်");
    }
}

// --- Main App Logic ---
document.addEventListener('DOMContentLoaded', function() {
    // Auth State ပြောင်းလဲမှုကို စောင့်ကြည့်
    supabase.auth.onAuthStateChange((event, session) => {
        const user = session?.user;
        const userNameElement = document.getElementById('userNameDisplay');
        
        if (userNameElement) {
            userNameElement.innerText = user ? 
                (user.user_metadata.full_name || user.phone || 'User') : 'Guest';
        }

        // Post များကို Load လုပ်မယ်
        if (typeof loadPosts === 'function') {
            loadPosts('health_posts'); 
        }
    });
});

        function clearPreview() {
            const box = document.getElementById('mediaPreviewBox');
            box.style.display = 'none';
            box.innerHTML = '';
            document.getElementById('mediaInput').value = '';
        }
function formatUserDisplayName(userData) {
    if (!userData) return "User";
    let badgeHTML = "";
    const displayName = userData.display_name || userData.user_name || "User";

    if (userData.is_crown) {
        badgeHTML += ` <span class="badge-official crown-bg">👑 Official</span>`;
    }
    if (userData.is_gold) {
        badgeHTML += ` <span class="badge-official gold-bg">💰Verified</span>`;
    }
    return `${displayName}${badgeHTML}`;
}

async function getMyDeviceId() {
    try {
        if (typeof FingerprintJS === 'undefined') return "unknown_id";
        if (!fpAgent) fpAgent = await FingerprintJS.load();
        const result = await fpAgent.get();
        return result.visitorId;
    } catch (e) { return "error_id"; }
}
function formatTime(timestamp) {
    if (!timestamp) return "";

    // Supabase က လာတဲ့ string ကို Date object အဖြစ်ပြောင်းလဲခြင်း
    let date = new Date(timestamp);

    // Date object မမှန်ကန်ရင် (Invalid Date ဖြစ်ရင်) ဘာမှမပြဘဲ ပြန်ထွက်မယ်
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

        const { error } = await supabase.rpc('increment_post_view', { 
            post_id_input: postId 
        });

        if (error) throw error;
        viewedPosts[postId] = true;
        localStorage.setItem('viewed_posts', JSON.stringify(viewedPosts));

        console.log(`✅ Post ${postId} view incremented successfully!`);

    } catch (err) {
        // Error ဖြစ်ခဲ့ရင် User ကို error message ပြမယ်
        console.error("View count တိုးလို့မရပါဘူး Senior:", err.message);
    }
}
function isSafeName(name) {
    // မြန်မာစာ၊ အင်္ဂလိပ်စာ၊ နံပါတ်များကို ခွင့်ပြုမယ်
    const regex = /^[\u1000-\u109F\u0020a-zA-Z0-9]+$/;
    return regex.test(name);
}
function queueNotification(userId, title, body, postId) {
    notifQueue.push({
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
    
    // ၃။ Loading logic အတွက် flag တွေရှိရင် false ပြန်လုပ်
    window.isFetching = false; 

    console.log("Cleanup completed: Observers disconnected and variables reset.");
}


/**
 * Combined Master Load Posts Function
 * @param {boolean} isLoadMore - နောက်ထပ် post များ ထပ်ယူမလား
 */
async function loadPosts(tableName = 'posts', isLoadMore = false) {
    window.MAIN_POST_TABLE = tableName; 

    const targetTable = window.MAIN_POST_TABLE; 
    if (window.isFetching) return;
    window.isFetching = true;

    if (!window.ADMIN_EMAIL) {
        window.ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;
    }

    const postsContainer = document.getElementById('newsFeed') || document.getElementById('post-container');
    if (!postsContainer) {
        window.isFetching = false;
        return;
    }

    const cacheKey = `cached_posts_${targetTable}`;
    const cacheTimeKey = `${cacheKey}_time`;
    
    const { data: { session } } = await supabase.auth.getSession();
    const currentUser = session?.user || null;
    const currentUid = currentUser?.id;
    const isAdmin = currentUser?.email === window.ADMIN_EMAIL;

    // --- ၂။ Cache Logic (Stale-While-Revalidate) ---
    let hasShownCache = false;

    if (!isLoadMore) {
        const cachedData = localStorage.getItem(cacheKey);
        const cachedTime = localStorage.getItem(cacheTimeKey);
        
        // Cache ရှိခဲ့ရင် အရင်ပြထားမယ်
        if (cachedData) {
            const cachedPosts = JSON.parse(cachedData);
            window.allPosts = cachedPosts;
            window.lastVisiblePost = cachedPosts[cachedPosts.length - 1]; 
            
            postsContainer.innerHTML = ''; 
            cachedPosts.forEach(post => {
                const html = renderPostHTML(post.id, post, currentUid, isAdmin, targetTable);
                postsContainer.insertAdjacentHTML('beforeend', html);
            });
            
            console.log("⚡ Showing cached posts first...");
            hasShownCache = true;

        } else {
            postsContainer.innerHTML = '<div style="text-align:center; padding:20px;">⏳ ပို့စ်များ ဖတ်နေသည်...</div>';
        }
    }

    try {
        // --- ၃။ Supabase Query ---
        let query = supabase
            .from(targetTable)
            .select('*')
            .order('is_pinned', { ascending: false }) 
            .order('created_at', { ascending: false }) 
            .limit(10);

        if (isLoadMore && window.lastVisiblePost) {
            query = query.lt('created_at', window.lastVisiblePost.created_at);
        }

        const { data, error } = await query; 
        if (error) throw error;

        // Data မရှိတော့ရင်
        if (!data || data.length === 0) {
            if (!isLoadMore && !hasShownCache) {
                postsContainer.innerHTML = '<div style="text-align:center; padding:20px;">📭 ပို့စ်မရှိသေးပါ Senior</div>';
            }
            window.isFetching = false;
            return;
        }

        if (!isLoadMore) {
            postsContainer.innerHTML = ''; 
        }
        
        window.lastVisiblePost = data[data.length - 1];
        window.allPosts = isLoadMore ? [...(window.allPosts || []), ...data] : data;

        data.forEach(post => {
            const html = renderPostHTML(post.id, post, currentUid, isAdmin, targetTable);
            postsContainer.insertAdjacentHTML('beforeend', html);
            
            const newPostEl = postsContainer.querySelector(`[data-id="${post.id}"]`);
            if (newPostEl && typeof postViewObserver !== 'undefined') {
                postViewObserver.observe(newPostEl);
            }
        });

        // --- ၅။ Cache Update ---
        if (!isLoadMore) {
            localStorage.setItem(cacheKey, JSON.stringify(data));
            localStorage.setItem(cacheTimeKey, Date.now().toString());
        }

        console.log(`✅ ${isLoadMore ? 'More' : 'Fresh'} Posts Loaded from ${targetTable}`);

    } catch (error) {
        console.error("Load posts error:", error);
        if (!isLoadMore && !hasShownCache) {
            postsContainer.innerHTML = `❌ Error: ${error.message}`;
        }
    } finally {
        window.isFetching = false;
    }
}
async function refreshPosts() {
    // ၁။ အရင်ဆုံး အဟောင်းတွေ၊ observer တွေ အကုန်ရှင်းမယ်
    cleanupPosts(); 

    const targetTable = window.MAIN_POST_TABLE || 'posts';
    const postsContainer = document.getElementById('newsFeed') || document.getElementById('post-container');
    
    if (postsContainer) {
        postsContainer.innerHTML = '<div style="text-align:center; padding:20px;">⏳ Refreshing...</div>';
    }

    // ၂။ Data အသစ်ကို လှမ်းခေါ်မယ်
    await loadPosts(targetTable, false);
}

function refreshFeed() {
    // ၁။ အရင်ဆုံး အကုန်ရှင်းမယ်
    cleanupPosts();

    const targetTable = window.MAIN_POST_TABLE || 'posts';
    const container = document.getElementById('newsFeed') || document.getElementById('post-container');
    
    if (container) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:purple;">
                <div class="spinner" style="margin-bottom:10px;">⏳</div>
                <div style="font-weight:bold; font-size:14px;">အသစ်ပြန်ပွင့်နေသည်...</div>
            </div>
        `;
    }

    if (typeof loadPosts === 'function') {
        loadPosts(targetTable, false); 
    } else {
        console.error("Master function 'loadPosts' ကို ရှာမတွေ့ပါ Senior!");
    }
}

function renderPostsToUI(posts, currentUid, isAdmin) {
    const targetTable = window.MAIN_POST_TABLE || 'posts';
    const postsContainer = document.getElementById('newsFeed') || document.getElementById('post-container');
    
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
   if (isFetching || !lastVisiblePost) return;
    
    isFetching = true;
    const postsContainer = document.getElementById('newsFeed');
    
    try {
        // --- AUTH SESSION ---
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session ? session.user : null;
        const isAdmin = currentUser ? (currentUser.email === ADMIN_EMAIL) : false;

        let query = supabase
            .from(targetTable)
            .select('*')
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(10);

        if (lastVisiblePost && lastVisiblePost.created_at) {
            query = query.lt('created_at', lastVisiblePost.created_at);
        }

        const { data, error } = await query;

        if (error) throw error;

        if (!data || data.length === 0) {
            const loadMoreBtn = document.getElementById('scroll-trigger');
            if (loadMoreBtn) loadMoreBtn.innerHTML = "No more posts";
            isFetching = false;
            return;
        }

        lastVisiblePost = data[data.length - 1];

        // --- UI RENDERING ---
        let html = '';
        data.forEach(item => {
            if (window.allPosts) window.allPosts.push(item);
            
            html += renderPostHTML(item.id, item, currentUser?.id, isAdmin,targetTable);
        });

        const loadMoreBtnContainer = document.getElementById('scroll-trigger');
        if (loadMoreBtnContainer) {
            loadMoreBtnContainer.insertAdjacentHTML('beforebegin', html);
        } else {
            postsContainer.insertAdjacentHTML('beforeend', html);
        }

        if (typeof restartObservers === 'function') {
            restartObservers();
        }

    } catch (error) {
        console.error("Load more error:", error);
    } finally {
        isFetching = false;
    }
}

function cleanupPosts() {
    // Memory leak မဖြစ်အောင် observer တွေကို ဖြုတ်ချင်ရင် သုံးနိုင်ပါတယ်
    if (window.videoObserver) {
        document.querySelectorAll('video').forEach(v => window.videoObserver.unobserve(v));
    }
    if (window.postViewObserver) {
        document.querySelectorAll('.post-card').forEach(p => window.postViewObserver.unobserve(p));
    }
}

window.openPhotoViewerFromId = function(index, postId) {
    // global array window.allPosts ထဲမှာ post ကို ရှာမယ်
    const post = (window.allPosts || []).find(p => String(p.id) === String(postId));
    
    if (post) {
        const mUrls = post.media_urls || post.mediaUrls || [];
        window.photoList = mUrls;
        window.currentIndex = index;
        
        if (typeof openFullViewer === "function") {
            openFullViewer(index, mUrls);
        } else {
            console.log("Photo Viewer UI function not found. Data ready:", mUrls);
        }
    } else {
        console.error("Post not found in window.allPosts for ID:", postId);
    }
};
function getDisplayNameWithBadge(d) {
    const data = d || {};
    const badges = [];

    const isCrown = data.is_crown ?? data.isCrown ?? false;
    const isGold = data.is_gold ?? data.isGold ?? false;

    // Badge များကို Array ထဲ ထည့်ခြင်း
    if (isCrown) {
        badges.push('<span class="badge-official crown-bg" title="Official Crown">👑</span>');
    }

    if (isGold) {
        badges.push('<span class="badge-official gold-bg" title="Gold Member">💰</span>');
    }

    // Display Name နှင့် Badge များကို ပေါင်းပြီး return ပြန်ခြင်း
    const name = data.name || "Unknown User";
    return `${name} ${badges.join(' ')}`;
}

async function deletePost(id) 
{ const targetTable = window.MAIN_POST_TABLE || 'posts';
    // ၁။ Confirm လုပ်ခြင်း
    if(!confirm("ဖျက်မှာလား  ပုံ၊ ဗီဒီယိုနဲ့ Share ထားတဲ့ ပို့စ်တွေပါ အကုန်အပြီးဖျက်မှာနော်...")) return;

    try {
        // ၂။ ဖျက်မည့် Post Data ကို အရင်ယူခြင်း (Media URLs ယူရန်)
        const { data: postData, error: fetchError } = await supabase
            .from(targetTable)
            .select('*')
            .eq('id', id)
            .single();

        if(fetchError || !postData) return showToastMessage("Post မရှိတော့ပါဘူး ");
        
        // Supabase column နာမည်များအတိုင်း ယူခြင်း
        const urls = postData.media_urls || (postData.media_url ? [postData.media_url] : []);

        // ၃။ Bunny Storage ထဲက ဖိုင်များကို လိုက်ဖျက်ခြင်း
        for (const url of urls) {
            if (url && url.includes('b-cdn.net')) {
                await deleteFromBunny(url);
            } else if (url && url.includes('ibb.co')) {
                console.log("ImgBB ဖိုင်ကို Dashboard မှာ ဖျက်ပေးပါ Senior:", url);
            }
        }

        const { error: shareDelError } = await supabase
            .from('shares')
            .delete()
            .eq('original_post_id', id);

        if (shareDelError) console.warn("Shares deletion issue:", shareDelError.message);

        // (ခ) မူရင်း Post ကို ဖျက်ခြင်း
        const { error: postDelError } = await supabase
            .from(targetTable)
            .delete()
            .eq('id', id);

        if (postDelError) throw postDelError;

        // ၅။ UI ကို Refresh လုပ်ခြင်း
       showToastMessage
       ("မူရင်း၊ Shared post များ နှင့် Store ဖိုင်များ အားလုံး အောင်မြင်စွာ ဖျက်ပြီးပါပြီ Senior");

        if (typeof loadPosts === 'function') {
            loadPosts(targetTable);
        } else {
            location.reload();
        }

    } catch (error) {
        console.error("Delete error:", error);
       showToastMessage ("ဖျက်လို့မရပါဘူး Senior: " + error.message);
    }
}

async function deleteFromBunny(fileUrl) {
    try {
        // URL ထဲကနေ ဖိုင်နာမည်ကို ထုတ်ယူမယ်
        const fileName = fileUrl.split('/').pop().split('#')[0]; // #t=0.001 စတာတွေကို ဖယ်ထုတ်ရန်
const url = `https://sg.storage.bunnycdn.com/${BUNNY_STORAGE}/${fileName}`;

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'AccessKey': BUNNY_KEY
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
            const { count } = await supabase.from('friends').select('*', { count: 'exact', head: true }).eq('user_id', currentUid);
            if (count >= 3000) return; 

            const { data: others } = await supabase.from('profiles').select('id').neq('id', currentUid).limit(10);
            if (others) {
                for (let target of others) {
                    await supabase.from('friends').upsert([
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
        // ၃။ Auth Data ကို ကြိုယူထားမယ် (Render လုပ်တဲ့နေရာမှာ သုံးဖို့)
        const { data: { session } } = await supabase.auth.getSession();
        const currentUid = session?.user?.id;
        const isAdmin = session?.user?.email === window.ADMIN_EMAIL;

        // ၄။ Database Query (Comments အားလုံးကို ဆွဲထုတ်မယ်)
        const { data: comments, error } = await supabase
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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return showToastMessage("Please login first, Senior!");

    const userId = user.id;
    const btn = event.currentTarget;
    
    // UI elements ရှာဖွေခြင်း (Senior ရဲ့ original logic အတိုင်း)
    const countSpan = btn.querySelector('span'); // span ထဲမှာ နံပါတ်ရှိတယ်လို့ ယူဆပါတယ်
    let currentCount = parseInt(countSpan?.innerText || 0);

    // ၂။ လက်ရှိ Status စစ်ဆေးခြင်း
    const activeColor = type === 'likes' ? '#1877F2' : '#F7B125'; // Blue သို့မဟုတ် Orange
    const isActive = btn.style.color === activeColor || btn.style.color === 'rgb(24, 119, 242)' || btn.style.color === 'rgb(247, 177, 37)';

    // --- STEP 3: Optimistic UI Update ---
    btn.style.color = isActive ? '#65676B' : activeColor; // မူရင်းအရောင် မီးခိုးရောင် ပြန်ပြောင်း
    btn.style.fontWeight = isActive ? "normal" : "bold";
    
    if (countSpan) {
        const nextCount = isActive ? Math.max(0, currentCount - 1) : currentCount + 1;
        countSpan.innerText = nextCount;
    }

    // --- STEP 4: Smart Queue System (Joker Logic ပါဝင်သည်) ---
    const existingIndex = window.reactionQueue.findIndex(r => r.post_id === postId && r.type === type);

    if (existingIndex > -1) {
        window.reactionQueue.splice(existingIndex, 1);
    } else {
        window.reactionQueue.push({
            post_id: postId,
            user_id: userId,
            type: type, 
            table_name: targetTable, // <--- ဒါက အရေးကြီးဆုံး Joker Card ပါ (ဘယ် table ကို update လုပ်ရမလဲဆိုတာ သိဖို့)
            action: isActive ? 'remove' : 'add',
            created_at: new Date().toISOString()
        });
    }

    localStorage.setItem('pending_reactions', JSON.stringify(window.reactionQueue));

    // --- STEP 5: Background Sync ---
    if (navigator.onLine) {
        syncAllData(); 
    }
}

window.addEventListener('beforeunload', () => {
    if (reactionQueue.length > 0) syncAllData();
});
async function uploadAndPost() {
    const targetTable = window.MAIN_POST_TABLE || 'posts';
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return showToastMessage("Login အရင်ဝင်ပါ Senior");

    const user = session.user;
    const fileInput = document.getElementById('mediaInput');
    const postContent = document.getElementById('postContent');
    const files = Array.from(fileInput.files);
    const text = postContent.value.trim();
    const btn = document.getElementById('btnPost') || document.querySelector('button[onclick="uploadAndPost()"]');

    // Button Loading State
    const originalBtnText = btn ? btn.innerText : "တင်မည်";
    if (btn) {
        btn.disabled = true;
        btn.innerText = "တင်နေသည်...";
    }

    try {
        // ၁။ User Rank (Crown/Gold) စစ်ဆေးခြင်း
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_crown, is_gold, display_name')
            .eq('id', user.id)
            .single();

        const isPremium = profile?.is_crown || profile?.is_gold;
        const maxFiles = isPremium ? 10 : 1;
        const maxVideoSize = (isPremium ? 60 : 20) * 1024 * 1024; 

        // Validation စစ်ဆေးချက်များ
        if (!text && files.length === 0) throw new Error("စာ သို့မဟုတ် ဖိုင်တစ်ခုခု ထည့်ပေးပါ Senior");
        if (files.length > maxFiles) throw new Error(`သင့် Rank အလိုက် ${maxFiles} ဖိုင်သာ တင်ခွင့်ရှိပါတယ်`);

        const uploadPromises = files.map(async (file) => {
            const isVideo = file.type.startsWith('video/');
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;

            if (isVideo) {
                if (file.size > maxVideoSize) throw new Error(`ဗီဒီယိုဆိုဒ် ${isPremium ? '60MB' : '20MB'} ထက် ကျော်နေပါတယ်`);
                
                // Bunny Storage Upload
                const res = await fetch(`https://sg.storage.bunnycdn.com/${BUNNY_STORAGE}/${fileName}`, { 
                    method: 'PUT', 
                    headers: { 'AccessKey': BUNNY_KEY, 'Content-Type': 'application/octet-stream' },
                    body: file
                });

                if (!res.ok) throw new Error("Bunny Storage သို့ ဗီဒီယိုတင်ရတာ အဆင်မပြေပါ");
                return { url: `https://public-hospitals.b-cdn.net/${fileName}`, type: 'video' };
            } else {
                // ImgBB Upload
                const fd = new FormData();
                fd.append('image', file);
                
                const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: fd });
                const data = await res.json();
                if (!data.success) throw new Error("ImgBB သို့ ပုံတင်ရတာ အဆင်မပြေပါ");
                return { url: data.data.url, type: 'image' };
            }
        });

        // အပြိုင် (Parallel) စတင် Upload လုပ်ခြင်း
        const uploadResults = await Promise.all(uploadPromises);
        
        const mediaUrls = uploadResults.map(res => res.url);
        // Media Type သတ်မှတ်ချက် (Video ပါရင် Video၊ မပါရင် Image)
        const finalMediaType = uploadResults.some(res => res.type === 'video') ? 'video' : (files.length > 0 ? 'image' : 'text');

        // ၃။ Database Payload ပြင်ဆင်ခြင်း
        const postPayload = {
            uid: user.id,
            author: profile?.display_name || user.user_metadata?.display_name || "User",
            text: text,
            media_urls: mediaUrls,
            media_type: finalMediaType,
            is_crown: profile?.is_crown || false,
            is_gold: profile?.is_gold || false,
            likes: 0,
            views: 0,
            liked_by: [],
            created_at: new Date().toISOString()
        };

        // ၄။ Supabase သို့ Post တင်ခြင်း
        const { error: insertError } = await supabase
            .from(targetTable)
            .insert([postPayload]);

        if (insertError) throw insertError;

        // ၅။ အောင်မြင်လျှင် UI/Form ကို Reset လုပ်ခြင်း
        showToastMessage("တင်ပြီးပါပြီ Senior!");
        postContent.value = "";
        fileInput.value = "";
        
        const previewBox = document.getElementById('mediaPreviewBox');
        if (previewBox) {
            previewBox.innerHTML = '';
            previewBox.style.display = 'none';
        }

        // Post များ Refresh လုပ်ရန်
        if (typeof loadPosts === 'function') loadPosts();
        if (typeof refreshPosts === 'function') refreshPosts();

    } catch (e) {
        console.error("Upload Error:", e);
        showToastMessage(e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = originalBtnText;
        }
    }
}


async function checkFriendStatus(targetUserId) {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id;
    const actionBox = document.getElementById('friendActionBox');
    
    if (!actionBox || !currentUserId) return;
    if (currentUserId === targetUserId) {
        actionBox.innerHTML = ""; 
        return;
    }

    const { data } = await supabase
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
    const { data: { session } } = await supabase.auth.getSession();
    const btn = document.querySelector('#friendActionBox button');
    btn.disabled = true;
    btn.innerText = "ခဏစောင့်ပါ...";

    await supabase.from('friends').insert([{ user_id: session.user.id, friend_id: targetId }]);
    await checkFriendStatus(targetId); 
}

async function unfriendUser(targetId) {
    const { data: { session } } = await supabase.auth.getSession();
    if(!confirm("သူငယ်ချင်းအဖြစ်မှ ပယ်ဖျက်မှာ သေချာလား Senior?")) return;

    const btn = document.querySelector('#friendActionBox button');
    btn.disabled = true;
    btn.innerText = "ဖျက်နေပါသည်...";

    await supabase.from('friends').delete().match({ user_id: session.user.id, friend_id: targetId });
    await checkFriendStatus(targetId);
}

async function reactComment(postId, commentId, type) {
    // ၁။ Auth Session စစ်ဆေးခြင်း
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return showToastMessage("Login အရင်ဝင်ပါ Senior");
    
    const user = session.user;
    const uid = user.id;

    try {
        // ၂။ လက်ရှိ Comment ရဲ့ Data ကို ယူခြင်း
        const { data: comment, error: fetchError } = await supabase
            .from('comments')
            .select('*')
            .eq('id', commentId)
            .single();

        if (fetchError || !comment) return;

        // Table Column နာမည်များ (snake_case သုံးထားသည်ဟု ယူဆသည်)
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
        const { error: updateError } = await supabase
            .from('comments')
            .update({ 
                [field]: likedBy, 
                [countField]: currentCount 
            })
            .eq('id', commentId);

        if (updateError) throw updateError;

        // ၅။ UI ကို Refresh လုပ်ခြင်း (Post တစ်ခုလုံးရဲ့ comment တွေကို ပြန်ခေါ်ပြမယ်)
        const { data: allComments } = await supabase
            .from('comments')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        const isAdmin = user.email === ADMIN_EMAIL;
        const commsContainer = document.getElementById(`comms-${postId}`);
        if (commsContainer) {
            commsContainer.innerHTML = renderComments(postId, allComments, isAdmin, uid);
        }

        // ၆။ Notification Queue ထဲသို့ ထည့်ခြင်း
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
    // ၁။ Auth Check (Login ရှိမရှိ အရင်စစ်မယ်)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return showToastMessage("Login အရင်ဝင်ပါ Senior");
    
    const inputField = document.getElementById(`in-${id}`);
    const val = inputField.value.trim();
    if (!val) return;

    const user = session.user;
    const userData = currentUserData || {};
    
    // ၂။ Data Object တည်ဆောက်ခြင်း (Database Structure + Safety ID)
    const newComment = {
        post_id: id,
        user_id: user.id,
        user_name: user.user_metadata.display_name || "User",
        is_crown: userData.is_crown || false,
        is_gold: userData.is_gold || false,
        text: val,
        likes: 0,
        liked_by: [],
        hahas: 0,
        hahaed_by: [],
        created_at: new Date().toISOString(),
        // temp_id ကို Database ရဲ့ Unique Key အဖြစ် သုံးမှာမို့ UUID သုံးတာ အကောင်းဆုံးပါ
        temp_id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now().toString()
    };

    // ၃။ UI Update (Optimistic UI - Database ရလဒ်မစောင့်ဘဲ ချက်ချင်းပြမယ်)
    try {
        const commContainer = document.getElementById(`comms-${id}`);
        const isAdmin = user.email === ADMIN_EMAIL;
        
        // renderComments function ကိုသုံးပြီး HTML ထုတ်မယ်
        const tempHtml = renderComments(id, [newComment], isAdmin, user.id);
        commContainer.insertAdjacentHTML('beforeend', tempHtml);
        
        inputField.value = ""; // Input ကို ချက်ချင်းရှင်းမယ်
        commContainer.scrollTop = commContainer.scrollHeight; // အောက်ဆုံးကို scroll ဆွဲမယ်

    } catch (uiError) {
        console.error("UI Update Error:", uiError);
    }

    // ၄။ Queue ထဲသို့ ထည့်ခြင်း (Persistence Layer)
    // အရင်ရှိနေတဲ့ Queue ထဲကို အသစ်ထည့်မယ်
    window.commentQueue.push(newComment);
    
    // LocalStorage မှာ သိမ်းမယ် (အင်တာနက်ပြတ်ပြီး Browser ပိတ်သွားရင်တောင် မပျောက်တော့ဘူး)
    localStorage.setItem('pending_comments', JSON.stringify(commentQueue));
    
    console.log("✅ Comment queued and saved to LocalStorage.");

    // ၅။ Sync လုပ်ဖို့ ကြိုးစားမယ်
    // ဒီ Function က အင်တာနက်ရှိမရှိ စစ်ပြီး အလိုအလျောက် ပို့ပေးပါလိမ့်မယ်
    if (typeof syncAllData === 'function') {
        syncAllData();
    }
}
function renderComments(postId, comments, isAdmin, currentUid) {
    if (!comments || comments.length === 0) return `<div style="padding:10px; color:gray; font-size:12px;">မှတ်ချက်မရှိသေးပါ</div>`;
    
    // ပထမ ၅ ခုပဲ ပြမယ် (See More logic အတွက်)
    const initialComments = comments.slice(0, 5);
    let html = initialComments.map(c => renderCommentHTML(c, isAdmin, currentUid, postId)).join('');
    
    if (comments.length > 5) {
        html += `
            <div id="extra-comms-${postId}" style="display:none;"></div>
            <div id="more-btn-${postId}" onclick="showAllComments('${postId}')" 
                 style="color:purple; font-size:12px; cursor:pointer; padding:5px; font-weight:bold;">
                 View more comments...
            </div>`;
    }
    return html;
}

function renderCommentHTML(c, isAdmin, currentUid, postId) {
    const isMyComment = c.user_id === currentUid;
    return `
    <div class="comment-item" style="margin-bottom:8px; background:#f0f2f5; padding:8px 12px; border-radius:15px; position:relative;">
        <div style="font-weight:bold; font-size:13px; color:purple;">${c.user_name}</div>
        <div style="font-size:13px;">${c.text}</div>
        <div style="display:flex; gap:10px; margin-top:4px; font-size:11px; color:gray;">
            <span onclick="reactComment('${postId}', '${c.id}', 'likes')" style="cursor:pointer;">👍 ${c.likes || 0}</span>
            <span onclick="reactComment('${postId}', '${c.id}', 'hahas')" style="cursor:pointer;">😆 ${c.hahas || 0}</span>
            ${(isAdmin || isMyComment) ? `<span onclick="deleteComment('${c.id}', '${postId}')" style="color:red; cursor:pointer;">ဖျက်မည်</span>` : ""}
        </div>
    </div>`;
}

function renderPostHTML(id, d, uid, isAdmin,targetTable = 'posts') {
    // --- DATA NORMALIZATION ---
    const mUrls = d.media_urls || d.mediaUrls || [];
    const mType = d.media_type || d.mediaType || "";
    const createdAt = d.created_at || d.createdAt;
    const isPinned = d.is_pinned || d.isPinned || false;
    
    const isLiked = (d.liked_by || []).includes(uid);
    const isHahaed = (d.hahaed_by || []).includes(uid);
    const timeDisplay = typeof formatTime === "function" ? formatTime(createdAt) : "Just now";

    // --- TEXT LOGIC (SEE MORE) ---
    const textContent = d.text || "";
    const isLongText = textContent.length > 200;
    const initialText = isLongText ? textContent.substring(0, 200) : textContent;
    
    const textHTML = `
        <div id="text-container-${id}" style="margin:5px 0 10px 0; white-space:pre-wrap; font-size:14px; color:#333; line-height:1.5;">
            <span id="text-content-${id}">${initialText}</span>
            ${isLongText ? `<span id="btn-${id}" style="color:purple; font-weight:bold; cursor:pointer; font-size:13px;" onclick="toggleText('${id}', \`${encodeURIComponent(textContent)}\`)">... See More</span>` : ""}
        </div>`;

    // --- MEDIA RENDERER ---
    let mediaHTML = "";
    const getSafeVideoUrl = (url) => {
        if (!url) return "";
        let finalUrl = url;
if (finalUrl.includes("b-cdn.net") && !finalUrl.includes("/public-hospitals/")) {
    finalUrl = finalUrl.replace(/(b-cdn\.net)\//, "$1/public-hospitals/");
}
    return finalUrl.includes("#t=") ? finalUrl : `${finalUrl}#t=0.001`;
    };

    if (mUrls.length > 0) {
        if (mType === "video" || mUrls[0].toLowerCase().endsWith(".mp4")) {
            const safeVideo = getSafeVideoUrl(mUrls[0]);
            mediaHTML = `
                <div style="margin-top:10px; background:#000; border-radius:8px; overflow:hidden;">
                    <video src="${safeVideo}" preload="metadata" muted playsinline webkit-playsinline 
                           poster="${safeVideo}" style="width:100%; display:block; min-height:200px; max-height:450px;" 
                           onclick="this.paused ? this.play() : this.pause()"></video>
                </div>`;
        } else {
            // Photo Grid Logic - ID အသုံးပြု၍ ခေါ်ယူခြင်း
            const count = mUrls.length;
            const gridClass = count >= 4 ? "grid-4" : `grid-${count}`;
            const displayCount = count > 4 ? 4 : count;

            mediaHTML = `<div class="photo-grid ${gridClass}" style="margin-top:10px;">`;
            for (let i = 0; i < displayCount; i++) {
                const isLast = (i === 3 && count > 4);
                mediaHTML += `
                    <div class="grid-item" style="position:relative; cursor:pointer;" onclick="openPhotoViewerFromId(${i}, '${post.id}')">
                        <img src="${mUrls[i]}" loading="lazy" style="width:100%; height:100%; object-fit:cover; border-radius:4px;">
                        ${isLast ? `<div class="more-overlay" style="position:absolute; inset:0; background:rgba(0,0,0,0.5); color:white; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:20px; border-radius:4px;">+${count - 3}</div>` : ""}
                    </div>`;
            }
            mediaHTML += `</div>`;
        }
    }

    // --- UI RETURN ---
    return `
    <div class="post-card" id="post-${id}" style="background:white; border-radius:12px; padding:15px; margin-bottom:15px; box-shadow:0 2px 8px rgba(0,0,0,0.1); border: ${isPinned ? '1px solid #f0e6ff' : 'none'};">
        
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
               <b style="color:purple; font-size:15px;">${getDisplayNameWithBadge(d)}</b>
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
    ${typeof renderComments === "function" ? renderComments(id, [], isAdmin, uid) : ""}
</div>
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

        const { error } = await supabase
            .from(window.MAIN_POST_TABLE)
            .update({ 
                is_pinned: !currentStatus 
            })
            .eq('id', id);

        if (error) throw error;
        if (typeof loadPosts === 'function') {
            // Cache ကို ကျော်ပြီး နောက်ဆုံး data ရအောင် refreshPosts ခေါ်တာ ပိုကောင်းပါတယ်
            if (typeof refreshPosts === 'function') {
                refreshPosts();
            } else {
                loadPosts();
            }
        } else {
            location.reload();
        }

        // ၃။ အောင်မြင်ကြောင်း Console မှာ ပြခြင်း
        const msg = !currentStatus ? "📌 ပို့စ်ကို Pin ထိုးလိုက်ပါပြီ Senior" : "📍 Pin ကို ဖြုတ်လိုက်ပါပြီ Senior";
        console.log(msg);

    } catch (e) {
        console.error("Pin error:", e.message);
        showToastMessage("Pin လုပ်လို့မရပါဘူး Senior: " + e.message);
    }
}
function previewMedia(input) {
    const box = document.getElementById('mediaPreviewBox');
    if (!box) return;

    // ၁။ အရင်ရှိနေတဲ့ preview တွေကို ရှင်းမယ်
    box.innerHTML = "";
    const files = Array.from(input.files);
    
    // ၂။ Max Files Limit သတ်မှတ်ချက် (ဥပမာ - ၁၀ ပုံ)
    const MAX_FILES = 10;

    // ၃။ File အရေအတွက်ကို စစ်ဆေးခြင်း
    if (files.length > MAX_FILES) {
        showToastMessage(`Senior ရေ... တစ်ခါတင်ရင် အများဆုံး ${MAX_FILES} ပုံပဲ ခွင့်ပြုပါတယ်ဗျာ။`);
        
        // Input ကို ပြန်ရှင်းထုတ်ပြီး Preview Box ကို ဖျောက်မယ်
        input.value = "";
        box.style.display = 'none';
        return; 
    }

    // ၄။ ပုံမှန် Preview Logic (Limit မကျော်မှသာ ဒီကိုရောက်မယ်)
    if (files.length > 0) {
        // UI styling ကို code ထဲကနေ တိုက်ရိုက်သတ်မှတ်မယ်
        box.style.display = 'grid';
        box.style.gridTemplateColumns = 'repeat(auto-fill, minmax(80px, 1fr))';
        box.style.gap = '8px';
        box.style.padding = '10px';

        files.forEach((file, index) => {
            const url = URL.createObjectURL(file);
            let mediaElement;

            // Video ဖြစ်ဖြစ် Image ဖြစ်ဖြစ် ခွဲခြားပြီး HTML ထုတ်မယ်
            if (file.type.startsWith('video/')) {
                mediaElement = `
                    <div class="relative group" style="width:100%; height:80px;">
                        <video src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;" muted></video>
                        <button onclick="removeSingleFile(${index})" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-lg opacity-0 group-hover:opacity-100 transition">×</button>
                    </div>`;
            } else {
                mediaElement = `
                    <div class="relative group" style="width:100%; height:80px;">
                        <img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:8px; border: 1px solid #ddd;">
                        <button onclick="removeSingleFile(${index})" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-lg opacity-0 group-hover:opacity-100 transition">×</button>
                    </div>`;
            }
            
            box.insertAdjacentHTML('beforeend', mediaElement);
        });
    } else {
        box.style.display = 'none';
    }
}
function removeSingleFile(index) {
    const input = document.getElementById('mediaInput');
    const dt = new DataTransfer(); // FileList ကို ပြန်ပြင်ဖို့ DataTransfer သုံးရပါတယ်
    const { files } = input;

    for (let i = 0; i < files.length; i++) {
        if (index !== i) dt.items.add(files[i]); // ဖျက်ချင်တဲ့ index မဟုတ်ရင် ပြန်ထည့်မယ်
    }

    input.files = dt.files; // Input ထဲကို data အသစ်ပြန်ထည့်မယ်
    previewMedia(input);    // Preview ကို ပြန် refresh လုပ်မယ်
}

function clearPreview() {
    const box = document.getElementById('mediaPreviewBox');
    const mediaInput = document.getElementById('mediaInput');

    if (box) {
        // ၁။ Memory စားသက်သာစေရန် အရင်ကထုတ်ထားသော Object URLs များကို ဖျက်ခြင်း
        const imgs = box.querySelectorAll('img, video');
        imgs.forEach(item => {
            if (item.src.startsWith('blob:')) {
                URL.revokeObjectURL(item.src);
            }
        });

        // ၂။ UI ကို ပြန်ဖျောက်ပြီး အထဲက data များကို ရှင်းထုတ်ခြင်း
        box.style.display = 'none';
        box.innerHTML = '';
    }

    // ၃။ Input File ကိုပါ တစ်ခါတည်း ရှင်းလင်းခြင်း
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
        showToastMessage("Pop-up ကို ခွင့်ပြုပေးပါ Senior");
    }
}
async function saveInitialName() {
    const nameElement = document.getElementById('setupUserName');
    if (!nameElement) return;

    // ၁။ Supabase Session မှ User ကို ယူခြင်း
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
        showToastMessage("ကျေးဇူးပြု၍ Login အရင်ဝင်ပါ။");
        if (typeof showPhoneLogin === 'function') showPhoneLogin();
        return;
    }

    let inputName = nameElement.value.trim();
    
    // Validation အပိုင်း (မူရင်းအတိုင်း)
    if (!inputName) {
        nameElement.style.border = "2px solid red";
        nameElement.focus();
        return showToastMessage("အမည်ထည့်သွင်းပေးပါ။");
    }
    
    if (inputName.length < 2) {
        nameElement.style.border = "2px solid red";
        nameElement.focus();
        return showToastMessage("အမည်သည် အနည်းဆုံး ၂ လုံး ရှိရပါမည်။");
    }
    
    if (inputName.length > 12) {
        nameElement.style.border = "2px solid red";
        nameElement.focus();
        return showToastMessage(" အမည်ကို အများဆုံး ၁၂ လုံးသာ ခွင့်ပြုထားပါတယ်ခင်ဗျာ။");
    }
    
    if (!isSafeName(inputName)) {
        nameElement.style.border = "2px solid red";
        nameElement.focus();
        return showToastMessage("မြန်မာစာ၊ အင်္ဂလိပ်စာနဲ့ ဂဏန်းများသာ ထည့်နိုင်ပါသည်။");
    }

    const saveButton = document.querySelector('#nameSetupModal button');
    const originalButtonText = saveButton ? saveButton.innerText : "အတည်ပြုမည်";
    
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.innerText = "စစ်ဆေးနေသည်...";
    }

    try {
        let finalDisplayName = inputName;
        
        // ၂။ နာမည်တူ ရှိမရှိ စစ်ဆေးခြင်း (Public Users Table မှ)
        const { data: existingUsers, error: checkError } = await supabase
            .from('profiles') 
            .select('id, display_name')
            .eq('display_name', inputName)
            .limit(1);

        if (checkError) throw checkError;

        // နာမည်တူရှိနေပြီး ကိုယ်မဟုတ်ခဲ့ရင် နံပါတ်ကပ်မယ်
        if (existingUsers.length > 0 && existingUsers[0].id !== user.id) {
            const randomSuffix = Math.floor(1000 + Math.random() * 9000); 
            finalDisplayName = `${inputName}_${randomSuffix}`;
            
            if (finalDisplayName.length > 15) { 
                finalDisplayName = `${inputName.substring(0, 8)}_${randomSuffix}`;
            }
            console.log(`⚠️ Duplicate found. Auto-assigned: ${finalDisplayName}`);
        }

        if (saveButton) saveButton.innerText = "သိမ်းဆည်းနေသည်...";

        // ၃။ Supabase Auth Metadata Update (Auth Profile အတွက်)
        const { error: authUpdateError } = await supabase.auth.updateUser({
            data: { display_name: finalDisplayName }
        });
        if (authUpdateError) throw authUpdateError;

        // ၄။ Database (Public Table) Update
        // Upsert သည် ရှိရင် Update လုပ်ပြီး မရှိရင် Insert လုပ်ပေးပါသည်
        const { error: dbUpdateError } = await supabase
            .from('profiles')
            .upsert({
                id: user.id,
                display_name: finalDisplayName,
                is_profile_setup: true,
                updated_at: new Date().toISOString()
            });

        if (dbUpdateError) throw dbUpdateError;

        // UI Update
        const userNameDisplay = document.getElementById('userNameDisplay');
        if (userNameDisplay) userNameDisplay.innerText = finalDisplayName;

        const modal = document.getElementById('nameSetupModal');
        if (modal) modal.style.display = 'none';

        if (typeof showToastMessage === 'function') {
            showToastMessage(`အမည်ကို "${finalDisplayName}" အဖြစ် သိမ်းဆည်းလိုက်ပါပြီ။`, "success");
        } else {
         showToastMessage
            (`အမည်ကို "${finalDisplayName}" အဖြစ် အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။`);
        }

    } catch (error) {
        console.error("❌ Error saving name:", error);
        showToastMessage("နာမည်သိမ်းဆည်းခြင်း မအောင်မြင်ပါ။ " + (error.message || ""));
        nameElement.style.border = "2px solid red";
        nameElement.focus();
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerText = originalButtonText;
        }
        if (nameElement && !nameElement.style.border.includes('red')) {
            nameElement.style.border = "1px solid #ddd";
        }
    }
}
function showToastMessage(message, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        // UI ကို ပိုပြီး Mobile Friendly ဖြစ်အောင် ညှိထားပါတယ်
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
    
    // Background colors များကို ပိုလှအောင် ပြောင်းထားပါတယ်
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

// ၁။ deleteComment Function
async function deleteComment(commentId, postId) {
    if (!confirm("ဖျက်မှာလား?")) return;
    
    const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);
    
    if (error) {
        console.error("Delete error:", error);
    } else {
        // Comment ပြန် render လုပ်
        const { data: comments } = await supabase
            .from('comments')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });
            
        const { data: { session } } = await supabase.auth.getSession();
        const isAdmin = session?.user?.email === ADMIN_EMAIL;
        
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
            
            // Click Event Listener ကို တစ်ခါပဲ ထည့်ရန် စစ်ဆေးခြင်း
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

// ၂။ အားလုံးကို စုစည်းပြီး Observe လုပ်မည့် Function
function initObservers() {
    setTimeout(() => {
        // (က) Video များကို Observe လုပ်ခြင်း
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
async function startLiveNotifications() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    const user = session.user;
    const myUid = user.id;
    const defaultLogo = 'https://i.ibb.co/Xx3yHt2y/lastlogo.png';
    const myIcon = user.user_metadata?.avatar_url || defaultLogo;

    // ၁။ Realtime Channel တည်ဆောက်ခြင်း
    const notificationSubscription = supabase
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

                // unread ဖြစ်မှသာ Notification ပြမယ်
                if (notif.status === 'unread') {
                    
                    if (Notification.permission === "granted") {
                        const n = new Notification(notif.title || "အသိပေးချက်", {
                            body: notif.body || "",
                            icon: myIcon,
                            badge: defaultLogo,
                            tag: notif.id, // Notification အထပ်ထပ်မတက်အောင် ID နဲ့ Tag တွဲထားခြင်း
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
                                    // ပို့စ်က UI မှာ မရှိရင် Refresh လုပ်ပြီး ပြန်ရှာမယ်
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

                    // ၂။ ပြပြီးရင် Read အဖြစ် Update လုပ်ခြင်း
                    await supabase
                        .from('notifications')
                        .update({ status: 'read' })
                        .eq('id', notif.id);

                    // ၃။ Badge အရေအတွက်ကို Update လုပ်ခြင်း
                    if (typeof updateNotificationBadge === 'function') {
                        updateNotificationBadge();
                    }
                }
            }
        )
        .subscribe();
}

// Helper function: ပို့စ်ကို အရောင်လင်းပြရန်
function highlightPost(el) {
    el.style.transition = "background 1s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    el.style.background = "#fff9c4"; // အဝါနုရောင်
    setTimeout(() => {
        el.style.background = "white";
    }, 2500);
}
async function markAsRead(notificationId) {
    const { error } = await supabase
        .from('notifications')
        .update({ status: 'read' })
        .eq('id', notificationId);
    
    if (error) console.error("Mark as read error:", error);
    if (typeof updateNotificationBadge === 'function') updateNotificationBadge();
}
async function updateNotificationBadge() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const myUid = session.user.id;

    // Supabase မှာ unread status ရှိတဲ့ notification အရေအတွက်ကိုပဲ ဆွဲထုတ်မယ်
    const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true }) // head: true ဆိုရင် data တွေအကုန်မယူဘဲ count ပဲယူမှာမို့ ပိုမြန်ပါတယ်
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
supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user;
    const userNameDisplay = document.getElementById('userNameDisplay');
    const modal = document.getElementById('nameSetupModal');

    // ၁။ UI အခြေခံ Update လုပ်ခြင်း
    if (userNameDisplay) {
        userNameDisplay.innerText = user?.user_metadata?.display_name || 'Guest';
    }

    // Logout ဖြစ်သွားရင် (သို့မဟုတ်) User မရှိရင်
    if (event === 'SIGNED_OUT' || !user) {
        window.currentUserData = null; 
        console.log("User signed out.");
        return;
    }

    try {
        // ၂။ Device ID ရယူခြင်း
        const currentDevId = await Promise.race([
            getMyDeviceId(),
            new Promise(resolve => setTimeout(() => resolve("timeout_id"), 5000))
        ]);

        // ၃။ Ban Status စစ်ဆေးခြင်း
        const isBanned = await checkBanStatus(user.id, currentDevId);
        if (isBanned) {
            await supabase.auth.signOut();
            return;         }

        // ၄။ User Profile Data ရယူခြင်း
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle(); 

        window.currentUserData = profile || null;

        // ၅။ Device Lock Logic (Admin မဟုတ်ရင်)
        const ADMIN_EMAIL = window.ADMIN_EMAIL || import.meta.env.VITE_ADMIN_EMAIL;
        if (user.email !== ADMIN_EMAIL && window.currentUserData?.device_id) {
            if (currentDevId !== "timeout_id" && window.currentUserData.device_id !== currentDevId) {
                showToastMessage("Account Error: Device Lock အလုပ်လုပ်နေပါသည်။ အခြားဖုန်းဖြင့် ဝင်၍မရပါ!");
                await supabase.auth.signOut();
                return;
            }
        }

        // ၆။ Name Setup Modal ပြသရန် လို/မလို စစ်ဆေးခြင်း
        const displayName = window.currentUserData?.display_name || user.user_metadata?.display_name;
        if (displayName) {
            if (modal) modal.style.display = 'none';
            if (userNameDisplay) userNameDisplay.innerText = displayName;
        } else {
            if (modal) modal.style.display = 'flex';
        }

        // ၇။ Last Active နှင့် Device ID ကို Update လုပ်ခြင်း
        const updatePayload = {
            id: user.id,
            display_name: displayName || "User",
            last_active: new Date().toISOString()
        };
        if (currentDevId !== "timeout_id") updatePayload.device_id = currentDevId;

        await supabase.from('profiles').upsert(updatePayload);
      if (typeof loadPosts === 'function') {
            loadPosts(false); 
        }

        if (typeof startAutoFriendSystem === 'function') {
            startAutoFriendSystem(user.id).catch(e => console.log(e));
        }
        
        startLiveNotifications();
        if (typeof updateNotificationBadge === 'function') updateNotificationBadge();

    } catch (error) {
        console.error("Auth State Handler Error:", error);
    }
});

async function checkBanStatus(uid, deviceId) {
    if (!uid) return false;

    try {

        const { data, error } = await supabase
            .from('banned_users')
            .select('*')
            .or(`uid.eq.${uid},device_id.eq.${deviceId}`)
            .maybeSingle(); // ဒေတာတစ်ခုတည်း (သို့မဟုတ်) မရှိရင် null ပြန်ပေးမယ်

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


window.openPhotoViewer = function(index, photosJson) {
    try {
        let rawData = decodeURIComponent(photosJson);
        photoList = JSON.parse(rawData);
        
        if (!Array.isArray(photoList)) photoList = [photoList];
        
        currentIndex = index;

        const viewer = document.getElementById("photoViewer");
        const img = document.getElementById("activeImg");

        if (viewer && img) {
            viewer.style.display = "flex";
            
            // ၂။ Loading State (ပုံအသစ်မပေါ်ခင် အဟောင်းကြီး ကျန်မနေစေရန်)
            img.style.opacity = "0.5"; 
            img.src = photoList[currentIndex];

            // ၃။ ပုံအမှန်တကယ် Load ဖြစ်သွားမှ အလင်းပြန်တင်မယ်
            img.onload = () => {
                img.style.opacity = "1";
                img.style.transition = "opacity 0.3s ease";
            };

            // ၄။ Error Handling (ပုံ link သေနေရင်)
            img.onerror = () => {
                img.src = 'https://i.ibb.co/Xx3yHt2y/lastlogo.png';
                showToastMessage("ပုံကို ဆွဲထုတ်လို့ မရပါဘူး Senior", "error");
            };

            updatePhotoCount();
        }
    } catch (e) {
        console.error("Photo Viewer Error:", e);
        showToastMessage("Photo Viewer ဖွင့်လို့မရပါဘူး", "error");
    }
};
async function syncShares() {
    if (shareQueue.length === 0) return;

    const processingShares = [...shareQueue];
    for (const item of processingShares) {
        try {
            // ၁။ Shares table ထဲကို record သွင်းမယ်
            const { error } = await supabase.from('shares').insert(item);
            
            if (!error) {
                // ၂။ အောင်မြင်ရင် post table မှာ share count ကို RPC နဲ့ လှမ်းတိုးမယ်
                await supabase.rpc('increment_post_share', { post_id_input: item.post_id });
                
                // ၃။ Queue ထဲကနေ ဖယ်ထုတ်မယ်
                const idx = shareQueue.indexOf(item);
                if (idx > -1) shareQueue.splice(idx, 1);
            }
        } catch (e) {
            console.error("Share sync error for item:", e);
        }
    }
    localStorage.setItem('pending_shares', JSON.stringify(shareQueue));
}

async function syncAllData() {
    if (!navigator.onLine || window.isSyncing) return;

    // Queue တွေထဲမှာ data ရှိမရှိ စစ်ဆေးခြင်း
    const viewEntries = Object.entries(window.viewQueue || {});
    const hasData = (window.reactionQueue?.length > 0) || 
                    (window.shareQueue?.length > 0) || 
                    (viewEntries.length > 0) || 
                    (window.commentQueue?.length > 0) || 
                    (window.notifQueue?.length > 0);

    if (!hasData) return;

    // ၂။ Sync စတင်ပြီ - Lock ချခြင်း
    window.isSyncing = true;
    console.log("🔄 Global Syncing started...");

    try {
        // --- (က) VIEWS SYNC ---
        if (viewEntries.length > 0) {
            for (const [pid, count] of viewEntries) {
                const { error } = await supabase.rpc('increment_post_view', { 
                    post_id_input: pid,
                    inc_value: count 
                });
                if (!error) delete window.viewQueue[pid];
            }
        }

        if (window.commentQueue.length > 0) {
            const processingComments = [...window.commentQueue];
            const { error: comError } = await supabase.from('comments').insert(processingComments);
            
            if (!comError || comError.code === '23505') {
                window.commentQueue = window.commentQueue.filter(c => 
                    !processingComments.some(pc => pc.temp_id === c.temp_id)
                );
                console.log("✅ Comments Synced.");
            }
        }

        if (window.reactionQueue.length > 0) {
            const processingReactions = [...window.reactionQueue];
            for (const item of processingReactions) {
                const { error } = await supabase.rpc('toggle_reaction', {
                    p_post_id: item.post_id,
                    p_user_id: item.user_id, 
                    p_reaction_type: item.type,
                    p_action_type: item.action,
                    p_table_name: item.table_name || 'posts' // <--- Joker Card: Table နာမည်ပါမှ မှန်ကန်စွာ Update လုပ်မှာပါ
                });

                if (!error) {
                    const idx = window.reactionQueue.findIndex(r => r === item);
                    if (idx > -1) window.reactionQueue.splice(idx, 1);
                } else {
                    console.error("❌ Reaction Sync Error:", error.message);
                }
            }
        }

        // --- (ဃ) NOTIFICATIONS SYNC (Bulk Insert) ---
        if (window.notifQueue.length > 0) {
            const processingNotifs = [...window.notifQueue];
            const { error: notifError } = await supabase.from('notifications').insert(processingNotifs);
            
            if (!notifError || notifError.code === '23505') {
                window.notifQueue = window.notifQueue.filter(n => !processingNotifs.includes(n));
                console.log("✅ Notifications Synced.");
            }
        }

        // --- (င) SHARES SYNC ---
        if (window.shareQueue && window.shareQueue.length > 0) {
            const processingShares = [...window.shareQueue];
            for (const s of processingShares) {
                const { error } = await supabase.rpc('increment_share_count', { 
                    post_id_input: s.post_id,
                    p_table_name: s.table_name || 'posts' // Share မှာလည်း Joker Card သုံးရင် ပိုကောင်းပါတယ်
                });
                if (!error) {
                    const idx = window.shareQueue.indexOf(s);
                    if (idx > -1) window.shareQueue.splice(idx, 1);
                }
            }
        }

    } catch (err) {
        console.error("Critical Sync Failure:", err);
    } finally {
        // ၃။ နောက်ဆုံးအခြေအနေကို LocalStorage မှာ Backup ပြန်သိမ်းမယ်
        if (typeof saveAllQueuesToLocal === 'function') {
            saveAllQueuesToLocal();
        }
        
        // Lock ပြန်ဖွင့်မယ်
        window.isSyncing = false;
        console.log("🏁 Sync Process Finished.");
    }
}

/**
 * Queue အားလုံးကို LocalStorage ထဲ တစ်ခါတည်း စနစ်တကျ သိမ်းပေးမည့် Helper
 */
function saveAllQueuesToLocal() {
    const dataMap = {
        'view_queue': viewQueue,
        'pending_reactions': reactionQueue,
        'pending_comments': commentQueue,
        'pending_notifications': notifQueue,
        'pending_shares': typeof shareQueue !== 'undefined' ? shareQueue : []
    };

    Object.entries(dataMap).forEach(([key, val]) => {
        // Data ရှိမှ သိမ်းမယ်၊ မရှိရင် LocalStorage ကနေ ဖယ်မယ် (Cleanup)
        if (val && (Array.isArray(val) ? val.length > 0 : Object.keys(val).length > 0)) {
            localStorage.setItem(key, JSON.stringify(val));
        } else {
            localStorage.removeItem(key);
        }
    });
}

// ၄။ အင်တာနက် ပြန်တက်လာတာနဲ့ အလိုအလျောက် Sync လုပ်ခိုင်းမယ်
window.addEventListener('online', syncAllData);

// ၅။ ၅ မိနစ်တစ်ခါ Background Sync လုပ်ပေးမယ် (Double Safety)
setInterval(syncAllData, 5 * 60 * 1000);

window.changeSlide = function(direction) {
    // ၁။ photoList ရှိမရှိ အရင်စစ်မယ်
    if (!window.photoList || window.photoList.length === 0) return;

    // ၂။ Index ကို တွက်ချက်မယ်
    currentIndex += direction;
    if (currentIndex < 0) currentIndex = photoList.length - 1;
    if (currentIndex >= photoList.length) currentIndex = 0;

    const img = document.getElementById("activeImg");
    if (img) {
        // ၃။ ပုံအသစ်မပေါ်ခင် ခေတ္တမှိန်ပြမယ် (Smooth Transition)
        img.style.opacity = "0.5";
        
        // ၄။ ပုံအသစ်ကို ထည့်မယ်
        img.src = photoList[currentIndex];

        // ၅။ ပုံအမှန်တကယ် Load ဖြစ်သွားမှ အလင်းပြန်တင်မယ်
        img.onload = () => {
            img.style.opacity = "1";
        };

        // ၆။ ပုံ link သေနေရင် (Error Handling)
        img.onerror = () => {
            img.src = 'https://i.ibb.co/Xx3yHt2y/lastlogo.png'; // Senior ရဲ့ Logo ပြမယ်
        };
    }

    // ၇။ အောက်က "1/5" စတဲ့ စာသားကို Update လုပ်မယ်
    if (typeof updatePhotoCount === 'function') {
        updatePhotoCount();
    }
};
function updatePhotoCount() {
    const countElement = document.getElementById("photoCount");
    if (countElement && window.photoList) {
        // photoList ရဲ့ အရှည်ကိုကြည့်ပြီး "1 / 5" စသဖြင့် ပြပေးမယ်
        countElement.innerText = `${currentIndex + 1} / ${photoList.length}`;
    }
}

window.closePhotoViewer = function() {
    const viewer = document.getElementById("photoViewer");
    if (viewer) {
        viewer.style.display = "none";
        // Memory ရှင်းထုတ်ရန် (Optional)
        // window.photoList = [];
    }
};
window.toggleText = function(id, fullTextEncoded) {
    const fullText = decodeURIComponent(fullTextEncoded);
    const contentSpan = document.getElementById(`text-content-${id}`);
    const btn = document.getElementById(`btn-${id}`);
    
    if (btn.innerText.includes("See More")) {
        contentSpan.innerText = fullText;
        btn.innerText = " Show Less";
    } else {
        contentSpan.innerText = fullText.substring(0, 200);
        btn.innerText = "... See More";
    }
};


// ၁။ Translation Object (မူရင်းအတိုင်း)
const translations = {
    mm: {
        edit_cover: "📷 Edit Cover",
        user_tier: "Normal User",
        uploading: "ပုံတင်နေပါသည်...",
        post_placeholder: " ဗဟုသုတများ မျှဝေပါ...",
        video_limit: "👋 ဗီဒီယို 20mb သာတင်လို့ရသည်🌍",
        select_media: "📷 ပုံ/ဗီဒီယို ရွေးရန်",
        post_btn: "တင်မည်",
        gold_title: "ရွှေရောင် $ အကောင့်",
        gold_desc: "Apply for Gold Tier",
        crown_title: "ခရမ်းရောင် Crown",
        crown_desc: "Lifetime Membership",
        apply_btn: "လျှောက်ထားရန်",
        policy_header: "📢 App Policy & Guarantees",
        feedback_title: "📝 App Feedback ပေးရန်",
        feedback_placeholder: "App အသုံးပြုရတာ အဆင်ပြေရဲ့လား?",
        send_btn: "ပို့မည်",
        nav_user: "User", nav_group: "Group", nav_chat: "Chat", nav_live: "Live", nav_profile: "Profile"
    },
    en: {
        edit_cover: "📷 Edit Cover",
        user_tier: "Normal User",
        uploading: "Uploading...",
        post_placeholder: " Share your knowledge...",
        video_limit: "👋 Video limit is 20mb only🙏",
        select_media: "📷 Select Media",
        post_btn: "Post",
        gold_title: "Gold $ Tier",
        gold_desc: "Get Gold Badge",
        crown_title: "Purple Crown",
        crown_desc: "Lifetime Membership",
        apply_btn: "Apply Now",
        policy_header: "📢 App Policy & Guarantees",
        feedback_title: "📝 Give App Feedback",
        feedback_placeholder: "Is the app working well for you?",
        send_btn: "Send",
        nav_user: "User", nav_group: "Group", nav_chat: "Chat", nav_live: "Live", nav_profile: "Profile"
    }
};

// ၂။ UI ကို Update လုပ်မည့် Function
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

// ၃။ Supabase ကနေ Language Preference ယူခြင်း
async function initLanguage() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        applyLanguage('mm'); // Login မဝင်ရသေးရင် mm ပြမယ်
        return;
    }

    // Profiles table ထဲမှာ language column ရှိမရှိ စစ်ပြီး ယူမယ်
    const { data: profile } = await supabase
        .from('profiles')
        .select('language')
        .eq('id', session.user.id)
        .single();

    const userLang = profile?.language || 'mm';
    applyLanguage(userLang);
}

// ၄။ ဘာသာစကား ပြောင်းလဲပြီး Database မှာ သိမ်းခြင်း
async function changeLanguage(newLang) {
    applyLanguage(newLang);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        await supabase
            .from('profiles')
            .update({ language: newLang })
            .eq('id', session.user.id);
    }
}

async function requestUpgrade(type, event) {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    
    // ခလုတ်ကို ယူခြင်း
    const btn = event.target;
    
    // ၁။ Translation နှင့် အတည်ပြုချက် ရယူခြင်း
    const isMM = localStorage.getItem('app_lang') === 'mm' || false;
    const confirmMsg = isMM 
        ? `${type.toUpperCase()} Tier အတွက် လျှောက်ထားမှာ သေချာပါသလား Senior?` 
        : `Are you sure you want to apply for ${type.toUpperCase()} Tier?`;
    
    if (!confirm(confirmMsg)) return;

    // ၂။ Loading State ပြောင်းခြင်း
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = isMM ? "လုပ်ဆောင်နေပါသည်..." : "Processing...";

    try {
        // ၃။ Supabase 'upgrade_requests' table ထဲသို့ ထည့်ခြင်း
        const { error } = await supabase
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

        // ၄။ အောင်မြင်ကြောင်း အသိပေးခြင်း
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return showToastMessage("Login အရင်ဝင်ပါ Senior");

    try {
        // Queue ထဲ ထည့်မယ် (SyncAllData ကနေ Database ကို ပို့ပေးလိမ့်မယ်)
        shareQueue.push({
            post_id: postId,
            user_id: session.user.id,
            created_at: new Date().toISOString()
        });
        localStorage.setItem('pending_shares', JSON.stringify(shareQueue));
        
        // UI မှာ Share Count ချက်ချင်း တိုးပြမယ်
        const shareBtn = document.querySelector(`[data-id="${postId}"] span[onclick^="handleShare"]`);
        if (shareBtn) {
            let current = parseInt(shareBtn.innerText.match(/\d+/) || 0);
            shareBtn.innerHTML = `🚀 Share (${current + 1})`;
        }

        showToastMessage("News Feed ထဲသို့ Share လုပ်ပြီးပါပြီ Senior!");
        syncAllData(); // ချက်ချင်း Sync လုပ်ဖို့ ကြိုးစားမယ်
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
// ၁။ App စဖွင့်ချိန် (Auth ဖြစ်တာနဲ့)
supabase.auth.onAuthStateChange((event, session) => {
    if (session) syncAllData();
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        syncAllData();
    }
});
   window.videoObserver = videoObserver;
    window.allPosts = [];
    // ၃။ ပို့စ်နှင့်ဆိုင်သော Logic များ (Supabase Version များ)
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
       loadMorePosts,
       openPhotoViewerFromId,
       startLiveNotifications,
        updateNotificationBadge,
        checkFriendStatus,
        addFriendUser,
        unfriendUser,
        syncAllData, // ဒါကိုပါ ထည့်ပေးပါ
    loginWithGoogle,
    sendOTP,
    verifyOTP,
    showPhoneLogin,
    closePhoneLogin,
    toggleText
    };

    // ၄။ Data Loading နှင့်ဆိုင်သော Logic များ
    const postLoading = {
        loadPosts,
        loadMorePosts,
        cleanupPosts,
        refreshPosts,
        observePosts // ဒါကိုပါ global ထဲ ထည့်လိုက်မယ်
    };
Object.assign(window, postActions);
Object.assign(window, { loadPosts, refreshPosts, cleanupPosts });


    document.addEventListener('DOMContentLoaded', () => {

        console.log("✅ All functions exported to Global window.");
    });
})();

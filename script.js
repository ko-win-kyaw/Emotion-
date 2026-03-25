import { createClient } from '@supabase/supabase-js';

// ၂။ Initialize Supabase (တစ်နေရာတည်းမှာပဲ အတည်ပြုပါ)
const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);
(function() {
// ၃။ Global Variables (တစ်ခါပဲ ကြေညာပါ)
let reactionQueue = JSON.parse(localStorage.getItem('pending_reactions') || '[]');
let commentQueue = JSON.parse(localStorage.getItem('pending_comments') || '[]');
let shareQueue = JSON.parse(localStorage.getItem('pending_shares') || '[]');
let viewQueue = JSON.parse(localStorage.getItem('view_queue') || '{}');
let notifQueue = JSON.parse(localStorage.getItem('pending_notifications') || '[]');

let currentUserData = null; 
let lastVisiblePost = null; 
let isFetching = false;
let photoList = [];
let currentIndex = 0;
let fpAgent = null;
// Environment Variables
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;
const BUNNY_KEY = import.meta.env.VITE_BUNNY_KEY;
const BUNNY_STORAGE = import.meta.env.VITE_BUNNY_STORAGE;
const IMGBB_KEY = import.meta.env.VITE_IMGBB_KEY;

// --- ၄။ Core Functions (Self-Invoking မဟုတ်ဘဲ ပုံမှန်အတိုင်း ထားနိုင်ပါသည်) ---
// ဒါကို script ရဲ့ အပေါ်ဆုံးနားမှာ ထည့်ထားပါ
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
        // ၁။ LocalStorage ကနေ ကြည့်ပြီးသား ပို့စ် ဟုတ်မဟုတ် စစ်ဆေးခြင်း
        const viewedPosts = JSON.parse(localStorage.getItem('viewed_posts') || '{}');

        // ဒီ Device မှာ ဒီ Post ကို ကြည့်ပြီးသားဆိုရင် Database ဆီ Request မပို့တော့ဘူး
        if (viewedPosts[postId]) {
            return; 
        }

        // ၂။ Supabase RPC ကို လှမ်းခေါ်ပြီး View count တိုးခြင်း
        // RPC နာမည် 'increment_post_view' ကို သုံးထားပါတယ်
        const { error } = await supabase.rpc('increment_post_view', { 
            post_id_input: postId 
        });

        if (error) throw error;

        // ၃။ Database မှာ အောင်မြင်မှ LocalStorage မှာ "ကြည့်ပြီးသား" အဖြစ် မှတ်သားမယ်
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
// tableName ရဲ့ default value ကို MAIN_POST_TABLE ထားလိုက်ပါပြီ
async function loadPosts(isLoadMore = false, tableName = MAIN_POST_TABLE) {
    // ၁။ Fetching Check & Variables Setup
    if (isFetching) return;
    const postsContainer = document.getElementById('newsFeed') || document.getElementById('post-container');
    if (!postsContainer) return;

    // Table Name ပေါ်မူတည်ပြီး Cache ခွဲသိမ်းတာ logic အမှန်ပါပဲ Senior
    const cacheKey = `cached_posts_${tableName}`;
    const cacheTimeKey = `${cacheKey}_time`;
    
    // ၂။ Auth & Permissions Setup
    const { data: { session } } = await supabase.auth.getSession();
    const currentUser = session?.user || null;
    const currentUid = currentUser?.id;
    const isAdmin = currentUser?.email === import.meta.env.VITE_ADMIN_EMAIL;

    // ၃။ Cache Logic (ပထမဆုံးအကြိမ် Load လုပ်ချိန်မှာပဲ Cache ကို စစ်မယ်)
    if (!isLoadMore) {
        const cachedData = localStorage.getItem(cacheKey);
        const cachedTime = localStorage.getItem(cacheTimeKey);
        
        // 5 minutes cache (300000ms)
        if (cachedData && cachedTime && (Date.now() - cachedTime < 300000)) {
            const cachedPosts = JSON.parse(cachedData);
            lastVisiblePost = cachedPosts[cachedPosts.length - 1]; 
            
            postsContainer.innerHTML = ''; 
            // Senior ရဲ့ renderPostsToUI ကို ခေါ်တဲ့နေရာမှာ tableName ပါ ထည့်ပေးထားပါတယ်
            renderPostsToUI(cachedPosts, currentUid, isAdmin, tableName);
            console.log("⚡ Loaded from cache");
            return;
        }
        postsContainer.innerHTML = '<div style="text-align:center; padding:20px;">⏳ ပို့စ်များ ဖတ်နေသည်...</div>';
    }

    isFetching = true;

    try {
        // ၄။ Supabase Query Build
        let query = supabase
            .from(tableName) // အပေါ်က variable ကို သုံးထားပါတယ်
            .select('*')
            .order('is_pinned', { ascending: false }) // Senior ရဲ့ Table မှာ is_pinned (သို့) isPinned စစ်ပေးပါ
            .order('created_at', { ascending: false }) 
            .limit(10);

        // Pagination Logic (မူရင်းအတိုင်းLT သုံးထားပါတယ်)
        if (isLoadMore && lastVisiblePost) {
            query = query.lt('created_at', lastVisiblePost.created_at);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            if (!isLoadMore) postsContainer.innerHTML = '<div style="text-align:center; padding:20px;">📭 ပို့စ်မရှိသေးပါ Senior</div>';
            isFetching = false;
            return;
        }

        // ၅။ Rendering & Pagination Data
        if (!isLoadMore) postsContainer.innerHTML = ''; 
        
        lastVisiblePost = data[data.length - 1];
        window.allPosts = isLoadMore ? [...(window.allPosts || []), ...data] : data;

        data.forEach(post => {
            // post data တစ်ခုလုံးကို pass လုပ်တာဖြစ်လို့ Senior ရဲ့ renderPostHTML နဲ့ ကိုက်ပါတယ်
            const html = renderPostHTML(post.id, post, currentUid, isAdmin);
            postsContainer.insertAdjacentHTML('beforeend', html);
            
            // Intersection Observer ပြန်ချိတ်မယ်
            const newPostEl = postsContainer.querySelector(`[data-id="${post.id}"]`);
            if (newPostEl && typeof postViewObserver !== 'undefined') {
                postViewObserver.observe(newPostEl);
            }
        });

        // ၆။ Save to Cache
        if (!isLoadMore) {
            localStorage.setItem(cacheKey, JSON.stringify(data));
            localStorage.setItem(cacheTimeKey, Date.now().toString());
        }

        console.log(`✅ ${isLoadMore ? 'More' : 'Initial'} Posts Loaded for ${tableName}`);

    } catch (error) {
        console.error("Load posts error:", error);
        if (!isLoadMore) postsContainer.innerHTML = `❌ Error: ${error.message}`;
    } finally {
        isFetching = false;
    }
}

// UI ထုတ်ပေးသည့် Helper Function
function renderPostsToUI(posts, currentUid, isAdmin, tableName = MAIN_POST_TABLE) {
    const postsContainer = document.getElementById('newsFeed') || document.getElementById('post-container');
    if (!postsContainer) return;

    let html = "";
    
    // ၁။ Post တစ်ခုချင်းစီကို HTML ပြောင်းမယ်
    posts.forEach(p => {
        // Senior ရဲ့ Supabase data structure အရ p တစ်ခုလုံးကို ပို့ပေးရပါမယ်
        // (p.id, p, currentUid, isAdmin)
        html += renderPostHTML(p.id, p, currentUid, isAdmin);
    });

    // ၂။ Load More Button ကို UI အောက်ဆုံးမှာ ထည့်မယ်
    // posts အရေအတွက်က ၁၀ ခု (limit) ပြည့်မှသာ Load More ပြတာ ပိုကောင်းပါတယ်
    if (posts.length >= 10) {
        html += `
        <div id="scroll-trigger" style="text-align:center; margin:30px 0; padding-bottom: 50px;">
            <button id="btnLoadMore" 
                onclick="loadMorePosts('${tableName}')" 
                style="background:purple; color:white; border:none; padding:12px 25px; border-radius:25px; cursor:pointer; font-weight:bold; box-shadow: 0 4px 12px rgba(128,0,128,0.3); transition: 0.3s;">
                ပိုမိုကြည့်ရှုရန် (Load More)
            </button>
        </div>`;
    } else if (posts.length > 0) {
        // ပို့စ်က ၁၀ ခုအောက်ပဲရှိရင် "နောက်ထပ်မရှိတော့ပါ" ဆိုတာမျိုး ပြနိုင်ပါတယ်
        html += `<div style="text-align:center; color:gray; padding:20px; font-size:12px;">✨ ပို့စ်များအားလုံး ဖတ်ပြီးပါပြီ ✨</div>`;
    }

    // ၃။ UI ထဲကို ထည့်မယ်
    postsContainer.innerHTML = html;

    // ၄။ Video နဲ့ View Observer တွေ ပြန်နှိုးမယ်
    if (typeof restartObservers === 'function') {
        restartObservers();
    }
}

function restartObservers() {
    // 800ms စောင့်တာက DOM render ဖြစ်ချိန်ကို စောင့်တာပါ
    setTimeout(() => {
        // ၁။ Video များကို စစ်ဆေးပြီး Observe လုပ်ခြင်း
        const videos = document.querySelectorAll('video');
        videos.forEach(v => {
            v.muted = true;
            v.setAttribute('playsinline', '');
            
            // Global variable ဖြစ်တဲ့ videoObserver ရှိမရှိ စစ်ပြီး observe လုပ်မယ်
            if (window.videoObserver) {
                window.videoObserver.unobserve(v); // Double observe မဖြစ်အောင် အရင်ဖြုတ်တယ်
                window.videoObserver.observe(v);
            }
        });

        // ၂။ Post Card များကို View Count အတွက် Observe လုပ်ခြင်း
        const postCards = document.querySelectorAll('.post-card');
        postCards.forEach(p => {
            if (window.postViewObserver) {
                window.postViewObserver.unobserve(p); // ထပ်ခါတလဲလဲ view မတက်အောင် ဖြုတ်ပြီးမှ ပြန်တပ်တယ်
                window.postViewObserver.observe(p);
            }
        });

        console.log(`Observers restarted: ${videos.length} videos, ${postCards.length} posts.`);
    }, 800);
}
async function loadMorePosts(tableName = MAIN_POST_TABLE) {
    // တစ်ခါခေါ်နေစဉ် ထပ်မခေါ်ရန်နှင့် နောက်ဆုံး Post မရှိလျှင် ရပ်ရန်
    if (isFetching || !lastVisiblePost) return;
    
    isFetching = true;
    const postsContainer = document.getElementById('newsFeed');
    
    try {
        // --- AUTH SESSION ---
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session ? session.user : null;
        const isAdmin = currentUser ? (currentUser.email === ADMIN_EMAIL) : false;

        // --- SUPABASE QUERY ---
        // Firebase ရဲ့ startAfter နေရာမှာ .lt() (Less Than) ကို သုံးပါတယ်
        let query = supabase
            .from(tableName)
            .select('*')
            .order('isPinned', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(10);

        // အရင်ရှိပြီးသား နောက်ဆုံး post ရဲ့ အချိန်ထက် ငယ်တာကို ယူမယ်
        if (lastVisiblePost && lastVisiblePost.created_at) {
            query = query.lt('created_at', lastVisiblePost.created_at);
        }

        const { data, error } = await query;

        if (error) throw error;

        if (!data || data.length === 0) {
            // နောက်ထပ် Post မရှိတော့ရင် ခလုတ်ကို ဖျောက်လိုက်မယ် (Optional)
            const loadMoreBtn = document.getElementById('scroll-trigger');
            if (loadMoreBtn) loadMoreBtn.innerHTML = "No more posts";
            isFetching = false;
            return;
        }

        // နောက်ဆုံး Post ကို Update လုပ်မယ် (နောက်တစ်ခါ load more လုပ်ဖို့)
        lastVisiblePost = data[data.length - 1];

        // --- UI RENDERING ---
        let html = '';
        data.forEach(item => {
            // Global array ထဲကိုလည်း data သစ်တွေ ထည့်ပေးမယ် (Share logic အတွက်)
            if (window.allPosts) window.allPosts.push(item);
            
            html += renderPostHTML(item.id, item, currentUser?.id, isAdmin);
        });

        // Load More ခလုတ်ရဲ့ အပေါ်နားမှာ HTML အသစ်တွေကို ကပ်ထည့်မယ်
        const loadMoreBtnContainer = document.getElementById('scroll-trigger');
        if (loadMoreBtnContainer) {
            loadMoreBtnContainer.insertAdjacentHTML('beforebegin', html);
        } else {
            postsContainer.insertAdjacentHTML('beforeend', html);
        }

        // --- RESTART OBSERVERS ---
        // Video တွေနဲ့ View count တွေအတွက် Observer ပြန်နှိုးမယ်
        if (typeof restartObservers === 'function') {
            restartObservers();
        }

    } catch (error) {
        console.error("Load more error:", error);
    } finally {
        isFetching = false;
    }
}
async function refreshPosts(tableName = MAIN_POST_TABLE) {
    // ၁။ Pagination အတွက် မှတ်ထားတာတွေကို အကုန် Reset လုပ်မယ်
    lastVisiblePost = null; 
    window.allPosts = []; // Share logic အတွက် သိမ်းထားတာရှိရင်ပါ ရှင်းထုတ်မယ်

    // ၂။ UI ကို ခေတ္တရှင်းမယ်
    const postsContainer = document.getElementById('newsFeed') || document.getElementById('post-container');
    if (postsContainer) {
        postsContainer.innerHTML = '<div style="text-align:center; padding:20px;">⏳ Refreshing...</div>';
    }

    // ၃။ loadPosts ကို ခေါ်မယ် 
    // (အရေးကြီး) ပထမ parameter ကို false (isLoadMore = false) ပေးရပါမယ်
    await loadPosts(false, tableName);
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
function renderPostHTML(id, d, uid, isAdmin) {
    // Supabase မှာ array column တွေကို text[] အနေနဲ့ သိမ်းလေ့ရှိပါတယ်
    const isLiked = (d.liked_by || []).includes(uid);
    const isHahaed = (d.hahaed_by || []).includes(uid);
    
    // Supabase column နာမည်များ (မြွေစတိုင် _ သုံးလေ့ရှိသည်)
    const timeDisplay = formatTime(d.created_at || d.createdAt);

    let media = "";
    const originalViewStyle = "width:100%; height:auto; display:block; border-radius:8px; cursor:pointer; object-fit:contain; background:#f0f0f0; margin-top:10px;";

    // --- ၁။ SEE MORE LOGIC ---
    const isLongText = (d.text && d.text.length > 200);
    let textHTML = `<div id="text-${id}" class="post-text" style="margin:5px 0 10px 0; white-space:pre-wrap; font-size:14px; text-align:left; color:#333; line-height:1.5;">${d.text || ""}</div>`;
    if (isLongText) {
        textHTML += `<span id="btn-${id}" class="see-more-btn" style="color:purple; font-weight:bold; cursor:pointer; font-size:13px;" onclick="toggleText('${id}')">... See More</span>`;
    }

    // --- ၂။ VIDEO URL SAFE (Bunny CDN Logic) ---
    const getSafeVideoUrl = (url) => {
        if (!url) return "";
        let finalUrl = url;
        if (finalUrl.includes("b-cdn.net") && !finalUrl.includes("b-cdn.net/public-hospitals/")) {
            finalUrl = finalUrl.replace("b-cdn.net/", "b-cdn.net/public-hospitals/");
        }
        return finalUrl.includes("#t=") ? finalUrl : `${finalUrl}#t=0.001`;
    };

    // --- ၃။ MEDIA HANDLING ---
    // Supabase မှာ column နာမည်ကို media_urls လို့ ပေးထားရင် ပြင်ပေးပါ
    const mUrls = d.media_urls || d.mediaUrls || [];
    const mType = d.media_type || d.mediaType;
    const mUrl = d.media_url || d.mediaUrl;

    if (mUrls.length > 0) {
        if (mType === "video") {
            const safeVideo = getSafeVideoUrl(mUrls[0]);
            media = `<div style="margin-top:10px; background:#000; border-radius:8px; overflow:hidden;">
                        <video src="${safeVideo}" preload="metadata" muted playsinline webkit-playsinline poster="${safeVideo}" style="width:100%; display:block; min-height:200px; background:#000;"></video>
                     </div>`;
        } else {
            const count = mUrls.length;
            const gridClass = count >= 4 ? "grid-4" : `grid-${count}`;
            const displayCount = count > 4 ? 4 : count;
            const photosJson = encodeURIComponent(JSON.stringify(mUrls));
            media = `<div class="photo-grid ${gridClass}">`;
            for (let i = 0; i < displayCount; i++) {
                const isLast = (i === 3 && count > 4);
                media += `<div class="grid-item" onclick="openPhotoViewer(${i}, '${photosJson}')"><img src="${mUrls[i]}" loading="lazy">${isLast ? `<div class="more-overlay">+${count - 3}</div>` : ""}</div>`;
            }
            media += `</div>`;
        }
    } else if (mUrl) {
        if (mType === "video" || mUrl.toLowerCase().includes(".mp4")) {
            const safeVideo = getSafeVideoUrl(mUrl);
            media = `<div style="margin-top:10px; background:#000; border-radius:8px; overflow:hidden;">
                        <video src="${safeVideo}" preload="metadata" muted playsinline webkit-playsinline poster="${safeVideo}" style="width:100%; display:block; min-height:200px; background:#000;"></video>
                     </div>`;
        } else {
            const singlePhotoJson = encodeURIComponent(JSON.stringify([mUrl]));
            media = `<img onclick="openPhotoViewer(0,'${singlePhotoJson}')" src="${mUrl}" loading="lazy" style="${originalViewStyle}">`;
        }
    }

    // --- ၄။ FINAL UI ---
    return `
    <div class="post-card" data-id="${id}" style="background:white; border-radius:12px; padding:15px; margin-bottom:15px; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
                <b style="color:purple; font-size:15px; display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                    ${getDisplayNameWithBadge(d)}
                </b>
                <small style="color:gray; font-size:11px;">${timeDisplay}</small>
            </div>
            <div style="display:flex; gap:10px; flex-shrink:0; margin-left:10px;">
                ${isAdmin ? `<button onclick="togglePin('${id}', ${d.is_pinned || d.isPinned || false})" style="border:none; background:none; cursor:pointer; padding:0; font-size:16px;">${(d.is_pinned || d.isPinned) ? "📌" : "📍"}</button>` : ""}


                ${isAdmin ? `<button onclick="deletePost('${id}')" style="border:none; background:none; cursor:pointer; padding:0; font-size:16px;">🗑️</button>` : ""}
            </div>
        </div>

        ${textHTML} ${media}

        <div style="display:flex; justify-content:space-between; margin-top:12px; border-top:1px solid #eee; padding-top:10px;">
            <div style="display:flex; gap:15px;">
                <span onclick="handleReact('${id}','likes',event)" style="cursor:pointer; font-weight:bold; color:${isLiked ? "blue" : "gray"}; font-size:14px;">
                    👍 Like (<span class="like-count">${d.likes || 0}</span>)
                </span>
                <span onclick="handleReact('${id}','hahas',event)" style="cursor:pointer; font-weight:bold; color:${isHahaed ? "orange" : "gray"}; font-size:14px;">
                    😆 Haha (<span class="haha-count">${d.hahas || 0}</span>)
                </span>
            </div>
            <div style="font-size:12px; color:gray;">
                👁️ ${d.views || 0} | <span onclick="handleShare('${id}')" style="cursor:pointer; color:purple; font-weight:bold;">🚀 Share (${d.shares || 0})</span>
            </div>
        </div>

        <div style="margin-top:10px;">
            <div id="comms-${id}" style="max-height:300px; overflow-y:auto;">
                ${typeof renderComments === "function" ? renderComments(id, d.comments, isAdmin, uid) : ""}
            </div>
            <div style="display:flex; gap:8px; margin-top:10px; align-items:center;">
                <input type="text" id="in-${id}" placeholder="မှတ်ချက်ပေးပါ..." style="flex:1; border-radius:20px; border:1px solid #ddd; padding:8px 15px; font-size:13px; outline:none; background:#f0f2f5;" onkeypress="if(event.key === 'Enter') addComment('${id}')">
                <button onclick="addComment('${id}')" style="background:purple; color:white; border:none; border-radius:50%; width:35px; height:35px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:14px;">➤</button>
            </div>
        </div>
    </div>`;
}
async function deletePost(id, tableName = MAIN_POST_TABLE) { 
    // ၁။ Confirm လုပ်ခြင်း
    if(!confirm("ဖျက်မှာလား Senior? ပုံ၊ ဗီဒီယိုနဲ့ Share ထားတဲ့ ပို့စ်တွေပါ အကုန်အပြီးဖျက်မှာနော်...")) return;

    try {
        // ၂။ ဖျက်မည့် Post Data ကို အရင်ယူခြင်း (Media URLs ယူရန်)
        const { data: postData, error: fetchError } = await supabase
            .from(tableName)
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !postData) return alert("Post မရှိတော့ပါဘူး Senior");
        
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
            .from(tableName)
            .delete()
            .eq('id', id);

        if (postDelError) throw postDelError;

        // ၅။ UI ကို Refresh လုပ်ခြင်း
        alert("မူရင်း၊ Shared post များ နှင့် Store ဖိုင်များ အားလုံး အောင်မြင်စွာ ဖျက်ပြီးပါပြီ Senior");

        if (typeof loadPosts === 'function') {
            loadPosts(tableName);
        } else {
            location.reload();
        }

    } catch (error) {
        console.error("Delete error:", error);
        alert("ဖျက်လို့မရပါဘူး Senior: " + error.message);
    }
}

// --- Bunny Storage ဖျက်သည့် Function (မူရင်းအတိုင်း သုံးနိုင်သည်) ---
async function deleteFromBunny(fileUrl) {
    try {
        // URL ထဲကနေ ဖိုင်နာမည်ကို ထုတ်ယူမယ်
        const fileName = fileUrl.split('/').pop().split('#')[0]; // #t=0.001 စတာတွေကို ဖယ်ထုတ်ရန်
        const url = `https://storage.bunnycdn.com/${BUNNY_STORAGE}/${fileName}`;

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

    if (!extraContainer || !btn) return;

    const isMM = localStorage.getItem('app_lang') === 'mm' || 
             document.documentElement.lang === 'mm' || true;
    const originalBtnText = btn.innerText;
    
    btn.innerText = isMM ? "⏳ ဖတ်နေသည်..." : "⏳ Loading...";
    btn.style.pointerEvents = "none";
    btn.style.opacity = "0.7";

    try {
        // ၂။ Supabase 'comments' table ထဲကနေ postId နဲ့ဆိုင်တဲ့ comment အားလုံးကို ဆွဲထုတ်မယ်
        const { data: comments, error } = await supabase
            .from('comments')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // ၃။ UI Rendering Logic
        if (comments && comments.length > 5) {
            // ပထမ ၅ ခုက ပို့စ်အောက်မှာ အမြဲတမ်းပြထားပြီးသားမို့လို့ (index 5) ကစပြီး ယူမယ်
            const hiddenComments = comments.slice(5); 
            
            // renderCommentHTML function ကို သုံးပြီး HTML string တည်ဆောက်မယ်
            const html = hiddenComments.map(c => renderCommentHTML(c)).join('');
            
            // Container ထဲ ထည့်ပြီး display ဖွင့်ပေးမယ်
            extraContainer.innerHTML = html;
            extraContainer.style.display = "block";
            
            // အကုန်ပြပြီးသွားပြီဖြစ်လို့ "See More" ခလုတ်ကို ဖျောက်လိုက်မယ်
            btn.style.display = "none"; 
        } else {
            // အကယ်၍ ထပ်ပြစရာ comment မရှိတော့ရင်
            btn.innerText = isMM ? "နောက်ထပ် မှတ်ချက်မရှိတော့ပါ" : "No more comments";
            setTimeout(() => { btn.style.display = "none"; }, 2000);
        }

    } catch (err) {
        console.error("Error loading comments:", err.message);
        btn.innerText = isMM ? "ပြန်ကြိုးစားပါ" : "Try again";
        btn.style.pointerEvents = "auto";
        btn.style.opacity = "1";
    }
};

async function uploadAndPost() {
    // ၁။ Auth Session စစ်ဆေးခြင်း
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return alert("Login အရင်ဝင်ပါ Senior");
    
    const user = session.user;
    const fileInput = document.getElementById('mediaInput');
    const files = Array.from(fileInput.files);
    const postContent = document.getElementById('postContent');
    const text = postContent.value.trim();
    const btn = document.getElementById('btnPost') || document.querySelector('button[onclick="uploadAndPost()"]');

    // Button Loading State
    const originalBtnText = btn ? btn.innerText : "တင်မည်";
    if (btn) {
        btn.disabled = true;
        btn.innerText = "တင်နေသည်...";
    }

    try {
        // ၂။ User Rank (Crown/Gold) ကို Profiles Table မှ စစ်ဆေးခြင်း
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_crown, is_gold, display_name')
            .eq('id', user.id)
            .single();

        const isPremium = profile?.is_crown || profile?.is_gold;
        const maxFiles = isPremium ? 10 : 1;
        const maxVideoSize = (isPremium ? 60 : 20) * 1024 * 1024; // Premium ဆို 60MB, Normal ဆို 20MB

        // Validation စစ်ဆေးချက်များ
        if (!text && files.length === 0) throw new Error("စာ သို့မဟုတ် ဖိုင်တစ်ခုခု ထည့်ပေးပါ Senior");
        if (files.length > maxFiles) throw new Error(`သင့် Rank အလိုက် ${maxFiles} ဖိုင်သာ တင်ခွင့်ရှိပါတယ်`);

        let mediaUrls = [];
        let mediaType = "text";

        // ၃။ Media Upload Logic (Loop ပတ်ပြီး ပို့မည်)
        for (let file of files) {
            const isVideo = file.type.startsWith('video/');
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;

            if (isVideo) {
                if (file.size > maxVideoSize) throw new Error(`ဗီဒီယိုဆိုဒ် ${isPremium ? '60MB' : '20MB'} ထက် ကျော်နေပါတယ်`);
                
                // Bunny Storage သို့ Upload တင်ခြင်း
                const res = await fetch(`https://sg.storage.bunnycdn.com/${BUNNY_STORAGE}/${fileName}`, { 
                    method: 'PUT', 
                    headers: { 'AccessKey': BUNNY_KEY, 'Content-Type': 'application/octet-stream' },
                    body: file
                });

                if (res.ok) {
                    mediaUrls.push(`https://public-hospitals.b-cdn.net/${fileName}`);
                    mediaType = 'video';
                } else {
                    throw new Error("Bunny Storage သို့ Upload တင်ရတာ အဆင်မပြေပါ");
                }
            } else {
                // ImgBB သို့ Image တင်ခြင်း
                mediaType = 'image';
                const fd = new FormData();
                fd.append('image', file);
                
                const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: fd });
                const data = await res.json();
                if (data.success) {
                    mediaUrls.push(data.data.url);
                } else {
                    throw new Error("ImgBB သို့ ပုံတင်ရတာ အဆင်မပြေပါ");
                }
            }
        }

        // ၄။ Supabase Table ထဲသို့ Post Data ထည့်ခြင်း
        // Senior အဓိက သုံးချင်တဲ့ Table နာမည် (page_posts သို့မဟုတ် health_posts) ကို ဒီမှာ ပြင်ပေးပါ
        const postPayload = {
            uid: user.id,
            author: profile?.display_name || user.user_metadata?.display_name || "User",
            text: text,
            media_urls: mediaUrls,
            media_type: mediaType,
            is_crown: profile?.is_crown || false,
            is_gold: profile?.is_gold || false,
            likes: 0,
            views: 0,
            liked_by: [], // JSONB column အတွက်
            created_at: new Date().toISOString()
        };

        const { error: insertError } = await supabase
            .from(MAIN_POST_TABLE) // <--- Senior ရဲ့ အဓိက Table နာမည်
            .insert([postPayload]);

        if (insertError) throw insertError;

        // ၅။ အောင်မြင်လျှင် UI ကို Reset လုပ်ခြင်း
        alert("တင်ပြီးပါပြီ Senior!");
        postContent.value = "";
        fileInput.value = "";
        
        const previewBox = document.getElementById('mediaPreviewBox');
        if (previewBox) {
            previewBox.innerHTML = '';
            previewBox.style.display = 'none';
        }

        // Post အသစ်များ ပြန် Load လုပ်ရန်
        if (typeof loadPosts === 'function') loadPosts();
        if (typeof refreshPosts === 'function') refreshPosts(MAIN_POST_TABLE);

    } catch (e) {
        console.error("Upload Error:", e);
        alert(e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = originalBtnText;
        }
    }
}

async function handleReact(postId, type, event) {
    // ၁။ Auth Check
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return alert("Please login first, Senior!");

    const userId = user.id;
    const btn = event.currentTarget;
    
    // UI elements တွေကို ရှာမယ် (သင့် HTML class name တွေနဲ့ ညှိထားပါတယ်)
    const countSpan = btn.querySelector(type === 'likes' ? '.like-count' : '.haha-count');
    let currentCount = parseInt(countSpan?.innerText || 0);

    // ၂။ လက်ရှိ Status စစ်ဆေးခြင်း (UI Color/State ကို ကြည့်ပြီး ခွဲခြားမယ်)
    const activeColor = type === 'likes' ? 'blue' : 'orange';
    const isActive = btn.style.color === activeColor;

    // --- STEP 3: Optimistic UI Update (ချက်ချင်းပြောင်းမယ်) ---
    btn.style.color = isActive ? 'gray' : activeColor;
    btn.style.fontWeight = isActive ? "normal" : "bold";
    
    if (countSpan) {
        const nextCount = isActive ? Math.max(0, currentCount - 1) : currentCount + 1;
        countSpan.innerText = nextCount;
    }

    // --- STEP 4: Smart Queue System ---
    // အရင်ရှိပြီးသား pending reaction ရှိမရှိ စစ်မယ်
    const existingIndex = reactionQueue.findIndex(r => r.post_id === postId && r.type === type);

    if (existingIndex > -1) {
        // အကယ်၍ Queue ထဲမှာ ရှိပြီးသားကို ထပ်နှိပ်တာဆိုရင် (Cancel လုပ်တာဖြစ်လို့) Queue ထဲက ပြန်ဖယ်မယ်
        reactionQueue.splice(existingIndex, 1);
        console.log("Reaction cancelled from queue.");
    } else {
        // Queue ထဲ မရှိသေးရင် အသစ်ထည့်မယ်
        reactionQueue.push({
            post_id: postId,
            user_id: userId,
            type: type, // 'likes' or 'hahas'
            action: isActive ? 'remove' : 'add', // Database logic အတွက် အထောက်အကူပြု
            created_at: new Date().toISOString()
        });
    }

    // LocalStorage မှာ Backup သိမ်းမယ် (App ပိတ်သွားရင်တောင် data မပျောက်အောင်)
    localStorage.setItem('pending_reactions', JSON.stringify(reactionQueue));

    // --- STEP 5: Background Sync ---
    // အင်တာနက်ရှိရင် ချက်ချင်း Sync လုပ်ဖို့ ကြိုးစားမယ်
    if (navigator.onLine) {
        syncAllData(); 
    }
}

// Browser Tab ပိတ်ခါနီးမှာ ကျန်နေတဲ့ Queue တွေကို အကုန်ပို့ဖို့ (One-time setup)
window.addEventListener('beforeunload', () => {
    if (reactionQueue.length > 0) syncAllData();
});

async function reactComment(postId, commentId, type) {
    // ၁။ Auth Session စစ်ဆေးခြင်း
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return alert("Login အရင်ဝင်ပါ Senior");
    
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return alert("Login အရင်ဝင်ပါ Senior");
    
    const inputField = document.getElementById(`in-${id}`);
    const val = inputField.value.trim();
    if (!val) return;

    const user = session.user;
    const userData = currentUserData || {};
    
    // Supabase Table Structure နဲ့ ကိုက်ညီသော Object
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
        temp_id: Date.now() // UI key အတွက်သာ
    };

    // --- STEP 1: UI Update (Optimistic UI) ---
    try {
        const commContainer = document.getElementById(`comms-${id}`);
        const isAdmin = user.email === ADMIN_EMAIL;
        
        // UI မှာ comment အသစ်ကို ချက်ချင်းပြမယ်
        const tempHtml = renderComments(id, [newComment], isAdmin, user.id);
        commContainer.insertAdjacentHTML('beforeend', tempHtml);
        
        inputField.value = "";
        commContainer.scrollTop = commContainer.scrollHeight;

    } catch (uiError) {
        console.error("UI Update Error:", uiError);
    }

    // --- STEP 2: Queue ထဲသို့ ထည့်ခြင်း (Background Sync လုပ်ရန်) ---
    commentQueue.push(newComment);
    
    // LocalStorage မှာ သိမ်းမယ်
    localStorage.setItem('pending_comments', JSON.stringify(commentQueue));
    
    console.log("Comment queued for sync...");
}
async function togglePin(id, currentStatus) { 
    try {
        // ၁။ Supabase Database မှာ Pin Status ကို ပြောင်းလဲခြင်း
        // currentStatus က true ဆိုရင် false ပြောင်းမယ်၊ false ဆိုရင် true ပြောင်းမယ်
        const { error } = await supabase
            .from(MAIN_POST_TABLE)
            .update({ 
                is_pinned: !currentStatus 
            })
            .eq('id', id);

        if (error) throw error;

        // ၂။ UI မှာ ပို့စ်တွေကို ချက်ချင်း အစီအစဉ်ပြန်စီရန် (isPinned က query မှာပါပြီးသားမို့ loadPosts ပြန်ခေါ်ရုံပါပဲ)
        if (typeof loadPosts === 'function') {
            // Cache ကို ကျော်ပြီး နောက်ဆုံး data ရအောင် refreshPosts ခေါ်တာ ပိုကောင်းပါတယ်
            if (typeof refreshPosts === 'function') {
                refreshPosts(MAIN_POST_TABLE);
            } else {
                loadPosts(MAIN_POST_TABLE);
            }
        } else {
            location.reload();
        }

        // ၃။ အောင်မြင်ကြောင်း Console မှာ ပြခြင်း
        const msg = !currentStatus ? "📌 ပို့စ်ကို Pin ထိုးလိုက်ပါပြီ Senior" : "📍 Pin ကို ဖြုတ်လိုက်ပါပြီ Senior";
        console.log(msg);

    } catch (e) {
        console.error("Pin error:", e.message);
        alert("Pin လုပ်လို့မရပါဘူး Senior: " + e.message);
    }
}

async function handleShare(id) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return alert("Login အရင်ဝင်ပါ Senior");

    // UI Optimistic Update (Share Count တိုးပြမယ်)
    const shareBtn = document.querySelector(`[data-id="${id}"] span[onclick^="handleShare"]`);
    if (shareBtn) {
        let current = parseInt(shareBtn.innerText.match(/\d+/) || 0);
        shareBtn.innerHTML = `🚀 Share (${current + 1})`;
    }

    try {
        // Queue ထဲသို့ Share Record ထည့်ခြင်း
        shareQueue.push({
            post_id: id,
            user_id: session.user.id,
            created_at: new Date().toISOString()
        });

        localStorage.setItem('pending_shares', JSON.stringify(shareQueue));
        
        alert("ပို့စ်ကို Share လိုက်ပါပြီ Senior!");
        
        // Background Sync ခေါ်မယ်
        syncShares();

    } catch (e) {
        console.error("Share Error:", e);
    }
}
function previewMedia(input) {
    const box = document.getElementById('mediaPreviewBox');
    if (!box) return;

    box.innerHTML = ""; // အရင်ရှိနေတဲ့ preview တွေကို ရှင်းမယ်
    const files = Array.from(input.files);

    if (files.length > 0) {
        box.style.display = 'grid'; // ပုံတွေအများကြီးဆို grid နဲ့ပြရင် ပိုလှပါတယ်
        box.style.gridTemplateColumns = 'repeat(auto-fill, minmax(80px, 1fr))';
        box.style.gap = '8px';
        box.style.padding = '10px';

        files.forEach(file => {
            const url = URL.createObjectURL(file);
            let element;

            if (file.type.startsWith('video/')) {
                element = `<video src="${url}" style="width:100%; height:80px; object-fit:cover; border-radius:8px;" muted></video>`;
            } else {
                element = `<img src="${url}" style="width:100%; height:80px; object-fit:cover; border-radius:8px;">`;
            }
            
            box.insertAdjacentHTML('beforeend', element);
        });
    } else {
        box.style.display = 'none';
    }
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
    
    // Supabase Storage ဒါမှမဟုတ် external URL တွေမှာ
    // Security layer တွေပါခဲ့ရင် အဆင်ပြေအောင် window.open ကို context နဲ့ သုံးမယ်
    const newWindow = window.open();
    if (newWindow) {
        newWindow.opener = null; // Security link ဖြတ်တောက်ခြင်း
        newWindow.location = imgSrc;
    } else {
        alert("Pop-up ကို ခွင့်ပြုပေးပါ Senior");
    }
}
async function saveInitialName() {
    const nameElement = document.getElementById('setupUserName');
    if (!nameElement) return;

    // ၁။ Supabase Session မှ User ကို ယူခြင်း
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
        alert("ကျေးဇူးပြု၍ Login အရင်ဝင်ပါ။");
        if (typeof showPhoneLogin === 'function') showPhoneLogin();
        return;
    }

    let inputName = nameElement.value.trim();
    
    // Validation အပိုင်း (မူရင်းအတိုင်း)
    if (!inputName) {
        nameElement.style.border = "2px solid red";
        nameElement.focus();
        return alert("အမည်ထည့်သွင်းပေးပါ။");
    }
    
    if (inputName.length < 2) {
        nameElement.style.border = "2px solid red";
        nameElement.focus();
        return alert("အမည်သည် အနည်းဆုံး ၂ လုံး ရှိရပါမည်။");
    }
    
    if (inputName.length > 12) {
        nameElement.style.border = "2px solid red";
        nameElement.focus();
        return alert("Senior ရေ... အမည်ကို အများဆုံး ၁၂ လုံးသာ ခွင့်ပြုထားပါတယ်ခင်ဗျာ။");
    }
    
    if (!isSafeName(inputName)) {
        nameElement.style.border = "2px solid red";
        nameElement.focus();
        return alert("မြန်မာစာ၊ အင်္ဂလိပ်စာနဲ့ ဂဏန်းများသာ ထည့်နိုင်ပါသည်။");
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
            .from('profiles') // သင့် Screenshot အရ profiles table ဖြစ်နိုင်သည်
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
            alert(`အမည်ကို "${finalDisplayName}" အဖြစ် အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။`);
        }

    } catch (error) {
        console.error("❌ Error saving name:", error);
        alert("နာမည်သိမ်းဆည်းခြင်း မအောင်မြင်ပါ။ " + (error.message || ""));
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
function renderComments(postId, comments, isAdmin, currentUid) {
    if (!comments || comments.length === 0) return "";
    
    // ပထမ ၅ ခုပဲ အရင်ပြမယ်
    const displayComments = comments.slice(0, 5);
    let html = displayComments.map(c => renderCommentHTML(c, isAdmin, currentUid, postId)).join('');

    if (comments.length > 5) {
        html += `<div id="extra-comms-${postId}" style="display:none;"></div>`;
        html += `<div id="more-btn-${postId}" onclick="showAllComments('${postId}')" style="color:purple; cursor:pointer; font-size:12px; margin-top:5px; font-weight:bold;">View all comments...</div>`;
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

// ၁။ Observer များကို ကြေညာခြင်း (Global အနေနဲ့ ထားပါ)
const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const video = entry.target;
        // ၇၀% ကျော် မြင်ရမှ Play မယ်၊ မဟုတ်ရင် Pause မယ်
        if (entry.intersectionRatio < 0.7) {
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
}, { threshold: [0, 0.7] });

// ၂။ အားလုံးကို စုစည်းပြီး Observe လုပ်မည့် Function
function initObservers() {
    // ၅၀၀ms စောင့်ပြီးမှ ရှာတာက ပိုစိတ်ချရပါတယ် (Post တွေ Render ဖြစ်ချိန်ပေးခြင်း)
    setTimeout(() => {
        // (က) Video များကို Observe လုပ်ခြင်း
        document.querySelectorAll('.post-video').forEach(video => {
            videoObserver.observe(video);
        });

        // (ခ) Post Card များကို Observe လုပ်ခြင်း (View Count သို့မဟုတ် အခြားကိစ္စအတွက်)
        document.querySelectorAll('.post-card').forEach(post => {
            if (window.postViewObserver) {
                window.postViewObserver.observe(post);
            }
        });
        
        console.log("🎯 Observers initialized for videos and posts!");
    }, 500);
}

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

                            const postId = this.data.post_id;
                            if (postId) {
                                let targetPost = document.querySelector(`[data-id="${postId}"]`);
                                
                                if (!targetPost) {
                                    // ပို့စ်က UI မှာ မရှိရင် Refresh လုပ်ပြီး ခဏစောင့်မယ်
                                    console.log("Post not found in DOM, refreshing...");
                                    if (typeof refreshPosts === 'function') {
                                        await refreshPosts('health_posts');
                                        
                                        // DOM render ဖြစ်ဖို့ 800ms လောက် စောင့်ကြည့်မယ်
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
        // ၂။ Device ID ရယူခြင်း (Timeout 5s)
        const currentDevId = await Promise.race([
            getMyDeviceId(),
            new Promise(resolve => setTimeout(() => resolve("timeout_id"), 5000))
        ]);

        // ၃။ Ban Status စစ်ဆေးခြင်း (Public table ထဲမှာ စစ်ရပါမယ်)
        // checkBanStatus function ကို Supabase version ပြင်ထားဖို့ လိုပါမယ်
        const isBanned = await checkBanStatus(user.id, currentDevId);
        if (isBanned) {
            await supabase.auth.signOut();
            return alert("သင့်အကောင့် ပိတ်ပင်ခံထားရပါသည် Senior");
        }

        // ၄။ User Profile Data ရယူခြင်း (profiles table မှ)
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        window.currentUserData = profile || null;

        // ၅။ Device Lock Logic (Admin မဟုတ်ရင် စစ်မယ်)
        if (user.email !== ADMIN_EMAIL && window.currentUserData) {
            if (currentDevId !== "timeout_id" && 
                window.currentUserData.device_id && 
                window.currentUserData.device_id !== currentDevId) {
                
                alert("Account Error: Device Lock အလုပ်လုပ်နေပါသည်။ အခြားဖုန်းဖြင့် ဝင်၍မရပါ!");
                await supabase.auth.signOut();
                return;
            }
        }

        // ၆။ Name Setup Modal ပြသရန် လို/မလို စစ်ဆေးခြင်း
        const hasStoredName = window.currentUserData?.display_name;
        const hasAuthName = user.user_metadata?.display_name;

        if (hasStoredName || hasAuthName) {
            if (modal) modal.style.display = 'none';
            if (userNameDisplay) userNameDisplay.innerText = hasStoredName || hasAuthName;
        } else {
            // နာမည်မရှိသေးရင် Modal ပြမယ်
            if (modal) modal.style.display = 'flex';
        }

        // ၇။ Last Active နှင့် Device ID ကို Update လုပ်ခြင်း (Upsert)
        const updatePayload = {
            id: user.id,
            display_name: hasStoredName || hasAuthName || "User",
            last_active: new Date().toISOString()
        };

        if (currentDevId !== "timeout_id") {
            updatePayload.device_id = currentDevId;
        }

        await supabase.from('profiles').upsert(updatePayload);

        // ၈။ Background Systems များ စတင်ခြင်း
        if (user.id) {
            // Auto Friend System ရှိရင် ခေါ်မယ်
            if (typeof startAutoFriendSystem === 'function') {
                startAutoFriendSystem(user.id).catch(err => console.log(err));
            }
        }
        
        // Notification စနစ် စတင်ခြင်း
        startLiveNotifications();

    } catch (error) {
        console.error("Auth State Handler Error:", error);
    }
});
// ၂။ Ban ဖြစ်ထားခြင်း ရှိမရှိ စစ်ဆေးရန် (UID သို့မဟုတ် Device ID ဖြင့်)
async function checkBanStatus(uid, deviceId) {
    if (!uid) return false;

    try {
        // Supabase 'banned_users' table ထဲမှာ ဒီ User ရှိမရှိ စစ်မယ်
        // .or() ကိုသုံးပြီး UID တူတာဖြစ်ဖြစ်၊ Device ID တူတာဖြစ်ဖြစ် တစ်ခုခုငြိရင် Ban မယ်
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
            alert(`🚫 သင့်အကောင့်သည် ပိတ်ပင်ခံထားရပါသည် Senior။\nအကြောင်းပြချက်: ${reason}`);
            return true;
        }

        return false;
    } catch (e) {
        console.error("Ban check exception:", e);
        return false;
    }
}
function getDisplayNameWithBadge(d) {
    // data မရှိခဲ့ရင် error မတက်အောင် empty object နဲ့ default ထားပါ
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

window.openPhotoViewer = function(index, photosJson) {
    try {
        // ၁။ Data Parsing (Supabase က JSON အစစ်ပေးရင် Parse လုပ်စရာမလိုဘဲ တိုက်ရိုက်သုံးနိုင်ပါတယ်)
        let rawData = decodeURIComponent(photosJson);
        photoList = JSON.parse(rawData);
        
        // အကယ်၍ photoList က array မဟုတ်ခဲ့ရင် array ဖြစ်အောင် ပြောင်းပေးခြင်း
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

// Sync လုပ်နေတုန်း နောက်ထပ် Sync ထပ်မဝင်အောင် တားထားတဲ့ Switch
window.isSyncing = false;

async function syncAllData() {
    // ၁။ Sync လုပ်နေဆဲဆိုရင် ထပ်မလုပ်ဘူး
    if (window.isSyncing) return;
    
    const viewEntries = Object.entries(viewQueue);
    
    // ၂။ Queue အားလုံး အားနေရင် Exit လုပ်မယ်
    if (reactionQueue.length === 0 && shareQueue.length === 0 && 
        viewEntries.length === 0 && commentQueue.length === 0 && 
        notifQueue.length === 0) return;

    window.isSyncing = true;
    console.log("🔄 Supabase Global Sync Started...");

    try {
        // --- ၁။ REACTIONS SYNC ---
        if (reactionQueue.length > 0) {
            try {
                for (const item of reactionQueue) {
                    await supabase.rpc('toggle_reaction', {
                        p_post_id: item.post_id,
                        p_user_id: item.user_id, // အရင်က 'uid' လို့ သုံးထားရင် item.user_id နဲ့ ညှိပါ
                        p_reaction_type: item.type,
                        p_action_type: item.action
                    });
                }
                reactionQueue = [];
                localStorage.removeItem('pending_reactions');
            } catch (e) { console.error("Reaction Sync Error:", e.message); }
        }

        // --- ၂။ SHARES SYNC ---
        if (shareQueue.length > 0) {
            try {
                for (const item of shareQueue) {
                    await supabase.from('shares').insert([{ post_id: item.post_id, user_id: item.user_id }]);
                    await supabase.rpc('increment_share_count', { post_id_input: item.post_id });
                }
                shareQueue = [];
                localStorage.removeItem('pending_shares');
            } catch (e) { console.error("Share Sync Error:", e.message); }
        }

        // --- ၃။ VIEWS SYNC ---
        if (viewEntries.length > 0) {
            try {
                for (const [pid, count] of viewEntries) {
                    await supabase.rpc('increment_post_view', { post_id_input: pid });
                }
                viewQueue = {};
                localStorage.removeItem('view_queue');
            } catch (e) { console.error("View Sync Error:", e.message); }
        }

        // --- ၄။ COMMENTS SYNC (Bulk Insert) ---
        if (commentQueue.length > 0) {
            try {
                const cleanComments = commentQueue.map(({temp_id, ...rest}) => rest);
                const { error } = await supabase.from('comments').insert(cleanComments);
                if (!error) {
                    commentQueue = [];
                    localStorage.removeItem('pending_comments');
                }
            } catch (e) { console.error("Comment Sync Error:", e.message); }
        }

        // --- ၅။ NOTIFICATIONS SYNC ---
        if (notifQueue.length > 0) {
            try {
                const { error } = await supabase.from('notifications').insert(notifQueue);
                if (!error) {
                    notifQueue = [];
                    localStorage.removeItem('pending_notifications');
                }
            } catch (e) { console.error("Notification Sync Error:", e.message); }
        }

        console.log("✅ All activities processed!");

    } catch (globalError) {
        console.error("❌ Global Sync Fatal Error:", globalError.message);
    } finally {
        window.isSyncing = false;
    }
}

// --- Event Listeners ---
window.addEventListener('online', () => {
    console.log("🌐 Internet Back! Syncing now...");
    syncAllData();
});

// ၅ မိနစ်တစ်ခါ Auto Sync လုပ်မယ်
setInterval(syncAllData, 300000); 

// App ပိတ်ခါနီးမှာ ကျန်တာ အကုန်ပို့မယ်
window.addEventListener('beforeunload', () => {
    syncAllData(); 
});

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
window.toggleText = function(id) {
    const textElement = document.getElementById(`text-${id}`);
    const btnElement = document.getElementById(`btn-${id}`);
    
    if (!textElement || !btnElement) return;

    // Class ကို toggle လုပ်လိုက်တာနဲ့ CSS က ကျန်တာ အကုန်လုပ်ပေးသွားပါလိမ့်မယ်
    const isExpanded = textElement.classList.toggle('expanded');

    if (isExpanded) {
        btnElement.innerText = " Show Less";
        // Expanded ဖြစ်သွားချိန်မှာ text element ဆီကို Smooth scroll လုပ်ပေးတာက UX ပိုကောင်းပါတယ်
        // ဒါပေမဲ့ text element က ရှည်နေရင် view ပျောက်သွားနိုင်လို့ scrollIntoView ကို သတိထားသုံးပါ
    } else {
        btnElement.innerText = "... See More";
        
        // "Show Less" ပြန်လုပ်တဲ့အခါ ပို့စ်ရဲ့ အပေါ်နားကို screen ပြန်ရောက်သွားအောင် လုပ်ပေးခြင်း
        // scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // ပိုကောင်းတဲ့ နည်းလမ်းကတော့ post card တစ်ခုလုံးကို ပြန်ညှိပေးတာပါ
        textElement.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const t = translations[lang] || translations.mm; // default ကို mm ထားတယ်
    
    // HTML Element ID တွေနဲ့ ချိတ်ဆက်ခြင်း
    // ဥပမာ- <span id="t-post-btn"></span>
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
            ? "လျှောက်ထားမှု အောင်မြင်ပါသည်။ Admin အတည်ပြုချက်ကို စောင့်ဆိုင်းပေးပါ Senior။" 
            : "Application successful. Please wait for Admin approval.";
        
        alert(successMsg);
        btn.innerText = isMM ? "စောင့်ဆိုင်းဆဲ..." : "Pending...";
        
    } catch (e) {
        console.error("Upgrade request error:", e.message);
        alert("Error: " + e.message);
        
        // Error ဖြစ်ရင် ခလုတ်ကို ပြန်ဖွင့်ပေးမယ်
        btn.disabled = false;
        btn.innerText = originalText;
    }
}
async function handleShare(postId) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return alert("Login အရင်ဝင်ပါ Senior");
    
    const user = session.user;
    const isMM = typeof currentLang !== 'undefined' ? currentLang === 'mm' : true;

    try {
        // ၁။ Shared_posts table ထဲကို ID လေးပဲ သွားထည့်မယ် (Storage အကုန်သက်သာဆုံးနည်း)
        const { error: shareError } = await supabase
            .from('shared_posts')
            .insert([{ 
                user_id: user.id, 
                original_post_id: postId 
            }]);

        if (shareError) throw shareError;

        // ၂။ မူရင်း Post ရဲ့ Share Count ကို RPC နဲ့ +1 တိုးမယ် (Request ၁ ကြိမ်တည်းနဲ့ ပြီးအောင်)
        await supabase.rpc('increment_shares', { post_id: postId });

        alert(isMM ? "News Feed ထဲသို့ Share လုပ်ပြီးပါပြီ Senior!" : "Shared to News Feed!");
        if (typeof loadPosts === 'function') loadPosts();

    } catch (e) {
        console.error("Share error:", e);
        alert(isMM ? "Share လုပ်လို့မရပါဘူး Senior" : "Share failed");
    }
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

    window.postViewObserver = postViewObserver;
    window.videoObserver = videoObserver;
    window.allPosts = [];
    window.lastVisiblePost = null;

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
        submitFeedback,
        saveInitialName,
        showAllComments,
        startLiveNotifications,
        updateNotificationBadge, // ဒါလေးပါ ထပ်ထည့်ပေးထားပါတယ်
        ADMIN_EMAIL: 'your-admin@email.com' // Senior ရဲ့ admin email ထည့်ရန်
    };

    // ၄။ Data Loading နှင့်ဆိုင်သော Logic များ
    const postLoading = {
        loadPosts,
        loadMorePosts,
        cleanupPosts,
        refreshPosts,
        observePosts // ဒါကိုပါ global ထဲ ထည့်လိုက်မယ်
    };

    // ၅။ အားလုံးကို Window Object ထဲသို့ ပေါင်းထည့်ခြင်း
    Object.assign(window, postActions, postLoading);

    // ၆။ App စတင်ချိန်မှာ လုပ်ဆောင်ရမည့် အရာများ
    document.addEventListener('DOMContentLoaded', () => {
        // အရင်ဆုံး Login Status ကို စစ်ဆေးမယ် (Auth Listener)
        // startLiveNotifications(); 
        
        console.log("🚀 Supabase Health App - Script Loaded Successfully!");
    });
})();

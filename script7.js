const supabaseUrl = "https://oktdmqfgqmhipbpbtnbl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdGRtcWZncW1oaXBicGJ0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTcxNjEsImV4cCI6MjA4OTEzMzE2MX0.Bi6cyYtGxiaMiW7Iv-3lSpXselY8kj4DLBZwch1AJws";
let _supabase;

document.addEventListener('DOMContentLoaded', function() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(supabaseUrl, supabaseKey);
    } else {
        console.error("Supabase SDK is not loaded properly.");
    }
    
    // ပို့စ်များကို စတင်ဆွဲထုတ်ယူခြင်း
    fetchPosts();
});

window.previewMedia = function(input) {
    const previewBox = document.getElementById('mediaPreviewBox');
    previewBox.innerHTML = ''; 
    
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        
        reader.onload = function(e) {
            previewBox.style.display = 'block';
            
            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.width = "100%";
                img.style.borderRadius = "8px";
                previewBox.appendChild(img);
            } else if (file.type.startsWith('video/')) {
                const video = document.createElement('video');
                video.src = e.target.result;
                video.controls = true;
                video.style.width = "100%";
                video.style.borderRadius = "8px";
                previewBox.appendChild(video);
            }
        };
        
        reader.readAsDataURL(file);
    } else {
        previewBox.style.display = 'none';
    }
};

window.uploadAndPost = async function() {
    if (!_supabase) {
        alert("Supabase မချိတ်ဆက်ထားပါ။");
        return;
    }

    const content = document.getElementById('postContent').value.trim();
    const mediaInput = document.getElementById('mediaInput');
    
    if (!content && (!mediaInput.files || mediaInput.files.length === 0)) {
        alert("စာ သို့မဟုတ် ပုံ/ဗီဒီယို အနည်းဆုံး တစ်ခု ထည့်သွင်းပေးပါ။");
        return;
    }

    const btnPost = document.getElementById('btnPost');
    btnPost.innerText = "တင်နေသည်...";
    btnPost.disabled = true;

    try {
        let mediaUrl = null;

        if (mediaInput.files && mediaInput.files[0]) {
            const file = mediaInput.files[0];

            // Cloudflare Function ဆီသို့ ပို့ရန် FormData တည်ဆောက်ခြင်း
            const uploadFormData = new FormData();
            uploadFormData.append('file', file);

            const uploadResponse = await fetch('/upload', {
                method: 'POST',
                body: uploadFormData
            });

            if (!uploadResponse.ok) {
                const errData = await uploadResponse.json();
                throw new Error(errData.error || "Upload failed");
            }

            const uploadData = await uploadResponse.json();
            mediaUrl = uploadData.url; // Cloudflare က ပြန်ပေးတဲ့ ပုံ သို့မဟုတ် ဗီဒီယို Link
        }

        let currentUserId = null;
        try {
            const { data: { user } } = await _supabase.auth.getUser();
            if (user) currentUserId = user.id;
        } catch (e) {}

        const { error: insertError } = await _supabase
            .from('health_posts')
            .insert([
                {
                    user_id: currentUserId,
                    content: content,
                    image_url: mediaUrl,
                    created_at: new Date().toISOString()
                }
            ]);

        if (insertError) throw insertError;

        alert("ကျန်းမာရေးပို့စ် တင်ပြီးပါပြီ!");
        
        // Form Reset လုပ်ခြင်း
        document.getElementById('postContent').value = '';
        document.getElementById('mediaInput').value = '';
        if (document.getElementById('mediaPreviewBox')) {
            document.getElementById('mediaPreviewBox').style.display = 'none';
        }
        
        fetchPosts();

    } catch (error) {
        console.error("Error posting data:", error.message);
        alert("ပို့စ်တင်ရာတွင် အမှားအယွင်းရှိပါသည်: " + error.message);
    } finally {
        btnPost.innerText = "တင်မည်";
        btnPost.disabled = false;
    }
};



async function fetchPosts() {
    const newsFeed = document.getElementById('newsFeed');
    if (!newsFeed || !_supabase) return;

    try {
        // 'health_posts' table ဆီကနေပဲ data ဆွဲထုတ်ခြင်း
        const { data, error } = await _supabase
            .from('health_posts')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (data && data.length > 0) {
            newsFeed.innerHTML = '';
            data.forEach(post => {
                const postCard = document.createElement('div');
                postCard.className = 'post-card';
                
                let mediaHtml = '';
                if (post.image_url) {
                    if (post.image_url.match(/\.(mp4|webm|ogg|mov)$/i)) {
                        mediaHtml = `
                            <div class="post-media-container" style="margin-top:10px;">
                                <video src="${post.image_url}" controls muted style="width:100%; border-radius:8px;"></video>
                            </div>`;
                    } else {
                        mediaHtml = `
                            <div class="post-media-container" style="margin-top:10px;">
                                <img src="${post.image_url}" alt="post media" style="width:100%; border-radius:8px;">
                            </div>`;
                    }
                }

                postCard.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                        <span style="font-size:24px;">👤</span>
                        <div>
                            <strong>Health Supporter</strong><br>
                            <small style="color:gray;">${new Date(post.created_at).toLocaleString()}</small>
                        </div>
                    </div>
                    <p class="post-text" style="white-space: pre-wrap;">${post.content || ''}</p>
                    ${mediaHtml}
                `;
                newsFeed.appendChild(postCard);
            });
        } else {
            newsFeed.innerHTML = '<div class="loading-status">ပို့စ်များ မရှိသေးပါ။</div>';
        }
    } catch (err) {
        console.error("Fetch posts error:", err.message);
        newsFeed.innerHTML = '<div class="loading-status" style="color:red;">ပို့စ်များကို ဆွဲယူရာတွင် အခက်အခဲရှိနေပါသည်။</div>';
    }
}



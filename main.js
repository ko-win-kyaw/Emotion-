// ၁။ Supabase ချိတ်ဆက်ခြင်း
// မှတ်ချက် - Vite သုံးထားမှသာ import.meta.env က အလုပ်လုပ်ပါမည်။
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// variable နာမည်ကို _supabase လို့ပဲ ဆက်ပေးထားပါတယ် (အောက်က logic တွေနဲ့ ကိုက်အောင်)
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// ၂။ unmuteVideo function
window.unmuteVideo = function() {
    const video = document.getElementById("mainVideo");
    const overlay = document.getElementById("global-overlay");
    
    if (overlay) overlay.style.display = "none";
    if (video) {
        video.muted = false;
        video.play().catch(e => console.log("Video Play Error:", e));
    }
}

// ၃။ Rating Data ဖတ်ယူခြင်း
async function loadRatings() {
    try {
        const { data, error, count } = await _supabase
            .from('app_feedback')
            .select('rating', { count: 'exact' }); // rating column တစ်ခုတည်းယူတာ ပိုမြန်ပါတယ်

        if (error) throw error;

        if (data && data.length > 0) {
            const total = data.reduce((sum, row) => sum + (row.rating || 0), 0);
            const avg = (total / count).toFixed(1);
            
            document.getElementById("avgStars").innerText = avg;
            document.getElementById("totalVoters").innerText = count;
        }
    } catch (err) {
        console.error("Load Error:", err.message);
    }
}

// ၄။ Rating ပေးခြင်း
async function sendRatingOnly() {
    const ratingInput = document.querySelector('input[name="rating"]:checked');
    if (!ratingInput) return alert("ကြယ်ပွင့်လေး နှိပ်ပေးပါဦး Senior");

    const ratingValue = parseInt(ratingInput.value);

    try {
        const { error } = await _supabase
            .from('app_feedback')
            .insert([{ rating: ratingValue }]);

        if (error) throw error;
        alert("Rating ပေးခဲ့မှုအတွက် ကျေးဇူးတင်ပါတယ်!");
        window.location.href = "user.html";
    } catch (err) {
        console.error("Insert Error:", err.message);
        // Error တက်ရင်လည်း redirect လုပ်မှာလား Senior? 
        // ပုံမှန်ဆိုရင်တော့ error ပြပြီး ဒီစာမျက်နှာမှာပဲ ခဏနေခိုင်းတာ ပိုကောင်းပါတယ်။
    }
}

// Event Listener
const submitBtn = document.getElementById('submitRating');
if(submitBtn) {
    submitBtn.addEventListener('click', sendRatingOnly);
}

// စတင်ချိန်မှာ Rating ဆွဲဖတ်မည်
loadRatings();

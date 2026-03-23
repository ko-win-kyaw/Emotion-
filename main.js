// ၁။ Supabase ချိတ်ဆက်ခြင်း (Security Proxy)
const { createClient } = supabase;
const supabaseUrl = window.location.origin + '/api/supabase';
const supabaseKey = 'public-access';
const _supabase = createClient(supabaseUrl, supabaseKey);

// ၂။ Magic Box နှိပ်လျှင် Video အသံဖွင့်ပြီး Box ဖျောက်မည့် Logic
window.unmuteVideo = function() {
    const video = document.getElementById("mainVideo");
    const overlay = document.getElementById("global-overlay");
    
    // Box ကို ဖျောက်လိုက်မယ်
    if (overlay) {
        overlay.style.display = "none";
    }
    
    // Video အသံဖွင့်ပြီး Play မယ်
    if (video) {
        video.muted = false;
        video.play().catch(e => console.log("Video Play Error:", e));
    }
}

// ၃။ Rating Data ဖတ်ယူခြင်း (AVG Rating ပြရန်)
async function loadRatings() {
    try {
        const { data, error, count } = await _supabase
            .from('app_feedback')
            .select('rating', { count: 'exact' });

        if (error) throw error;

        const avgStarsElem = document.getElementById("avgStars");
        const totalVotersElem = document.getElementById("totalVoters");

        if (data && data.length > 0) {
            const total = data.reduce((sum, row) => sum + (row.rating || 0), 0);
            const avg = (total / count).toFixed(1);
            
            if(avgStarsElem) avgStarsElem.innerText = avg;
            if(totalVotersElem) totalVotersElem.innerText = count;
        }
    } catch (err) {
        console.error("Load Error:", err.message);
    }
}

// ၄။ Rating ပေးခြင်း (Submit ခလုတ်နှိပ်သည့်အခါ)
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
        alert("Rating ပေးလို့မရသေးပါဘူး။");
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.getElementById('submitRating');
    if(submitBtn) {
        submitBtn.addEventListener('click', sendRatingOnly);
    }
    loadRatings();
});

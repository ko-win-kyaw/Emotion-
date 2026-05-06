const supabaseUrl = "https://oktdmqfgqmhipbpbtnbl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdGRtcWZncW1oaXBicGJ0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTcxNjEsImV4cCI6MjA4OTEzMzE2MX0.Bi6cyYtGxiaMiW7Iv-3lSpXselY8kj4DLBZwch1AJws";
let _supabase;

document.addEventListener('DOMContentLoaded', function() {
    if (typeof supabase !== 'undefined') {
        _supabase = supabase.createClient(supabaseUrl, supabaseKey);
        window.supabase = _supabase; 
    } else {
        console.error("Supabase SDK မရှိပါ။ HTML မှာ CDN မှန်အောင် ထည့်ထားလား ပြန်စစ်ပါ။");
    }

    const submitBtn = document.getElementById('submitRating');
    if (submitBtn) {
        submitBtn.addEventListener('click', sendRatingOnly);
    }

    loadRatings();
});

window.unmuteVideo = function() {
    const video = document.getElementById("mainVideo");
    const overlay = document.getElementById("global-overlay");
    if (overlay) overlay.style.display = "none";
    if (video) {
        video.muted = false;
        video.play().catch(e => console.log("Video play error:", e));
    }
};

async function loadRatings() {
    if (!_supabase) return;
    try {
        const { data, error } = await _supabase 
            .from('app_feedback')
            .select('rating');

        if (error) throw error;

        const avgStarsElem = document.getElementById("avgStars");
        const totalVotersElem = document.getElementById("totalVoters");

        if (data && data.length > 0) {
            const total = data.reduce((sum, row) => sum + (row.rating || 0), 0);
            const avg = (total / data.length).toFixed(1);
            if (avgStarsElem) avgStarsElem.innerText = avg;
            if (totalVotersElem) totalVotersElem.innerText = data.length;
        } else {
            if (avgStarsElem) avgStarsElem.innerText = "0.0";
            if (totalVotersElem) totalVotersElem.innerText = "0";
        }
    } catch (err) {
        console.error("Error fetching ratings:", err.message);
    }
}

async function sendRatingOnly() {
    if (!_supabase) return;

    if (localStorage.getItem("voted")) {
        alert("သင် rating ပေးပြီးသားပါ");
        return;
    }

    const ratingInput = document.querySelector('input[name="rating"]:checked');
    if (!ratingInput) {
        alert("ကြယ်ပွင့်ရွေးပါ");
        return;
    }

    const ratingValue = parseInt(ratingInput.value);

    try {
        const { error } = await _supabase 
            .from('app_feedback')
            .insert([{ rating: ratingValue }]);

        if (error) throw error;

        localStorage.setItem("voted", "true");
        alert("ကျေးဇူးတင်ပါတယ်!");
        loadRatings();

    } catch (err) {
        console.error("Insert error:", err.message);
        alert("Error: မအောင်မြင်ပါ။ နောက်မှ ပြန်ကြိုးစားပါ။");
    }
}

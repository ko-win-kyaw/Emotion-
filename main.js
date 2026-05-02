document.addEventListener('DOMContentLoaded', function() {
    // All your JavaScript functions here
    const supabaseUrl = "https://oktdmqfgqmhipbpbtnbl.supabase.co";
    const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rdGRtcWZncW1oaXBicGJ0bmJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTcxNjEsImV4cCI6MjA4OTEzMzE2MX0.Bi6cyYtGxiaMiW7Iv-3lSpXselY8kj4DLBZwch1AJws";
    const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

    window.unmuteVideo = function() {
        const video = document.getElementById("mainVideo");
        const overlay = document.getElementById("global-overlay");

        if (overlay) overlay.style.display = "none";

        if (video) {
            video.muted = false;
            video.play().catch(e => console.log(e));
        }
    };


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

            avgStarsElem.innerText = avg;
            totalVotersElem.innerText = data.length;
        } else {
            avgStarsElem.innerText = "0.0";
            totalVotersElem.innerText = "0";
        }

    } catch (err) {
        console.error(err.message);
    }
}

async function sendRatingOnly() {
    if (localStorage.getItem("voted")) {
        alert("သင် rating ပေးပြီးသားပါ");
        return;
    }

    const ratingInput = document.querySelector('input[name="rating"]:checked');
    if (!ratingInput) return alert("ကြယ်ပွင့်ရွေးပါ");

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
        console.error(err.message);
        alert("Server error ဖြစ်နေပါတယ်");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('submitRating')
        ?.addEventListener('click', sendRatingOnly);

    loadRatings();
});
});
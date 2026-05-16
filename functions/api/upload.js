// အကောင်းဆုံးဖြစ်အောင် ပေါင်းစပ်ထားသော ပုံစံ
export async function onRequest(context) {
    const { request, env } = context;
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST') return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers });

    try {
        const formData = await request.formData();
        const files = formData.getAll('file');
        const userId = formData.get('userId');

        if (!userId || !files.length) {
            return new Response(JSON.stringify({ success: false, error: "Missing userId or files" }), { status: 400, headers });
        }

        // 1. Badge Check (သီးသန့် catch လုပ်ထားရင် ပိုစိတ်ချရတယ်)
        let hasBadge = false;
        try {
            const userCheckRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=has_badge`, {
                headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
            });
            const userData = await userCheckRes.json();
            hasBadge = userData?.[0]?.has_badge || false;
        } catch (e) { console.error("Badge check failed:", e); }

        const maxFiles = hasBadge ? 10 : 1;
        const maxVideoSize = hasBadge ? 50 * 1024 * 1024 : 20 * 1024 * 1024;
        const maxImageSize = 5 * 1024 * 1024;

        if (files.length > maxFiles) throw new Error(`Max ${maxFiles} files allowed`);

        const uploadUrls = [];
        for (const file of files) {
            const isVideo = file.type.startsWith('video/');
            const limit = isVideo ? maxVideoSize : maxImageSize;
            if (file.size > limit) throw new Error(`${file.name} exceeds size limit`);

            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}_${file.name.replace(/\s/g, '_')}`;
            let url = "";

            if (isVideo) {
                // Bunny.net Upload
                const buffer = await file.arrayBuffer();
                const bunnyRes = await fetch(`https://storage.bunnycdn.com/${env.BUNNY_STORAGE_ZONE}/${fileName}`, {
                    method: 'PUT',
                    headers: { 'AccessKey': env.BUNNY_KEY, 'Content-Type': file.type },
                    body: buffer
                });
                if (!bunnyRes.ok) throw new Error("Bunny upload failed");
                url = `${env.BUNNY_PULL_ZONE_URL}/${fileName}`;
            } else {
                // ImgBB Upload
                const imgbbForm = new FormData();
                imgbbForm.append('image', file);
                const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${env.IMGBB_KEY}`, { method: 'POST', body: imgbbForm });
                const imgbbData = await imgbbRes.json();
                if (!imgbbData.success) throw new Error("ImgBB upload failed");
                url = imgbbData.data.url;
            }

            // 2. Database Logging
            await fetch(`${env.SUPABASE_URL}/rest/v1/uploads`, {
                method: 'POST',
                headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, type: isVideo ? 'video' : 'image', user_id: userId, storage_provider: isVideo ? 'bunny' : 'imgbb' })
            }).catch(err => console.error("DB Log Error:", err)); // DB error ကြောင့် upload တက်တာ မပျက်စီးအောင်

            uploadUrls.push(url);
        }

        return new Response(JSON.stringify({ success: true, urls: uploadUrls }), { headers });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers });
    }
}

                                                                                               

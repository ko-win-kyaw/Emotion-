// functions/api/upload.js

export async function onRequest(context) {
    const { request, env } = context;
    
    // CORS Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // Preflight request handle လုပ်ခြင်း
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { status: 405, headers });
    }

    try {
        const formData = await request.formData();
        const files = formData.getAll('file');
        const userId = formData.get('userId');

        if (!userId) {
            return new Response(JSON.stringify({ success: false, error: "User ID လိုအပ်ပါသည်" }), { status: 400, headers });
        }

        // --- ၁။ Database မှာ User ရဲ့ Badge Status စစ်ခြင်း ---
        const userCheckRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=has_badge`, {
            method: 'GET',
            headers: {
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
            }
        });

        const userData = await userCheckRes.json();
        const isBadge = userData && userData.length > 0 ? userData[0].has_badge : false;

        // --- ၂။ Limits သတ်မှတ်ခြင်း ---
        const maxFiles = isBadge ? 10 : 1; 
        const maxVideoSize = isBadge ? 50 * 1024 * 1024 : 20 * 1024 * 1024;
        const maxImageSize = 5 * 1024 * 1024; // 5MB

        if (files.length > maxFiles) {
            return new Response(JSON.stringify({ success: false, error: `Limit ထက်ကျော်လွန်နေပါသည်။ အများဆုံး ${maxFiles} ဖိုင်သာ တင်နိုင်ပါသည်။` }), { status: 400, headers });
        }

        let uploadUrls = [];

        for (const file of files) {
            const isVideo = file.type.startsWith('video/');
            const currentMaxSize = isVideo ? maxVideoSize : maxImageSize;

            if (file.size > currentMaxSize) {
                throw new Error(`${file.name} သည် အရွယ်အစား ကြီးလွန်းနေပါသည်။`);
            }

            let uploadedUrl = "";
            // ဖိုင်အမည်ကို ထပ်နေခြင်းမရှိအောင် Unique ဖြစ်အောင်လုပ်ခြင်း
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}_${file.name.replace(/\s+/g, '_')}`;

            // --- ၃။ Storage သို့ တင်ခြင်း ---
            if (isVideo) {
                // Bunny.net သို့ ဗီဒီယိုတင်ခြင်း
                const arrayBuffer = await file.arrayBuffer();
                const bunnyRes = await fetch(`https://storage.bunnycdn.com/${env.BUNNY_STORAGE_ZONE}/${fileName}`, {
                    method: 'PUT',
                    headers: { 
                        'AccessKey': env.BUNNY_KEY, 
                        'Content-Type': file.type 
                    },
                    body: arrayBuffer
                });

                if (!bunnyRes.ok) throw new Error("Bunny.net သို့ တင်ခြင်း မအောင်မြင်ပါ။");
                uploadedUrl = `${env.BUNNY_PULL_ZONE_URL}/${fileName}`;
            } else {
                // ImgBB သို့ ပုံတင်ခြင်း
                const imgbbFormData = new FormData();
                imgbbFormData.append('image', file);
                const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${env.IMGBB_KEY}`, {
                    method: 'POST',
                    body: imgbbFormData
                });
                const imgbbResult = await imgbbRes.json();
                
                if (!imgbbResult.success) throw new Error("ImgBB သို့ တင်ခြင်း မအောင်မြင်ပါ။");
                uploadedUrl = imgbbResult.data.url;
            }

            // --- ၄။ Database မှာ Record သိမ်းခြင်း (Logging) ---
            await fetch(`${env.SUPABASE_URL}/rest/v1/uploads`, {
                method: 'POST',
                headers: {
                    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: uploadedUrl,
                    type: isVideo ? 'video' : 'image',
                    user_id: userId,
                    storage_provider: isVideo ? 'bunny' : 'imgbb'
                })
            });

            uploadUrls.push(uploadedUrl);
        }

        // Frontend က script.js နဲ့ တိုက်ရိုက်ချိတ်ဆက်နိုင်ရန် Response ပို့ခြင်း
        return new Response(JSON.stringify({ 
            success: true, 
            urls: uploadUrls 
        }), { headers });

    } catch (error) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: error.message 
        }), { status: 500, headers });
    }
}

// functions/api/upload.js

export async function onRequest(context) {
    const { request, env } = context;
    
    // CORS & JSON Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // 1. Handle Options (CORS Preflight)
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers });
    }

    // 2. Only allow POST
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ 
            success: false, 
            error: "Method not allowed" 
        }), { status: 405, headers });
    }

    try {
        const formData = await request.formData();
        const files = formData.getAll('file');
        const userId = formData.get('userId');

        if (!userId) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "User ID လိုအပ်ပါသည်" 
            }), { status: 400, headers });
        }

        // --- အဆင့် (၁) Database ထဲမှာ User ရဲ့ Badge Status ကို စစ်ခြင်း ---
        const userCheckRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=has_badge`, {
            method: 'GET',
            headers: {
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
            }
        });

        const userData = await userCheckRes.json();
        const isBadge = userData.length > 0 ? userData[0].has_badge : false;

        // --- အဆင့် (၂) Limit များ သတ်မှတ်ခြင်း ---
        const maxFiles = isBadge ? 10 : 1; 
        const maxVideoSize = isBadge ? 50 * 1024 * 1024 : 20 * 1024 * 1024; // Badge 50MB, Normal 20MB
        const maxImageSize = 5 * 1024 * 1024; // 5MB

        if (!files || files.length === 0) {
            return new Response(JSON.stringify({ success: false, error: "ဖိုင်ရွေးချယ်မှု မတွေ့ပါ" }), { status: 400, headers });
        }

        if (files.length > maxFiles) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: `${isBadge ? 'Badge' : 'Normal'} အကောင့်အတွက် အများဆုံး ${maxFiles} ဖိုင်သာ ရပါမည်။` 
            }), { status: 400, headers });
        }

        let uploadResults = [];

        // Loop ပတ်ပြီး ဖိုင်တစ်ခုချင်းစီ တင်မယ်
        for (const file of files) {
            const isVideo = file.type.startsWith('video/');
            const currentMaxSize = isVideo ? maxVideoSize : maxImageSize;

            if (file.size > currentMaxSize) {
                const limitLabel = isVideo ? (isBadge ? '50MB' : '20MB') : '5MB';
                throw new Error(`${file.name} ဆိုဒ် ကြီးလွန်းသည်။ Limit: ${limitLabel}`);
            }

            let uploadedUrl = "";
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            // --- အဆင့် (၃) External Storage သို့ တင်ခြင်း ---
            if (isVideo) {
                // Bunny Storage Upload
                const arrayBuffer = await file.arrayBuffer();
                const bunnyRes = await fetch(`https://storage.bunnycdn.com/${env.BUNNY_STORAGE_ZONE}/${fileName}`, {
                    method: 'PUT',
                    headers: { 
                        'AccessKey': env.BUNNY_KEY, 
                        'Content-Type': file.type 
                    },
                    body: arrayBuffer
                });
                if (!bunnyRes.ok) throw new Error('Bunny Storage upload failed');
                uploadedUrl = `${env.BUNNY_PULL_ZONE_URL}/${fileName}`;
            } else {
                // ImgBB Upload
                const imgbbFormData = new FormData();
                imgbbFormData.append('image', file);
                const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${env.IMGBB_KEY}`, {
                    method: 'POST',
                    body: imgbbFormData
                });
                const result = await imgbbRes.json();
                if (!result.success) throw new Error('ImgBB upload failed');
                uploadedUrl = result.data.url;
            }

            // --- အဆင့် (၄) Database မှာ Upload Record သိမ်းခြင်း ---
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
                    storage_provider: isVideo ? 'bunny' : 'imgbb',
                    created_at: new Date().toISOString()
                })
            });

            uploadResults.push({ url: uploadedUrl, type: isVideo ? 'video' : 'image' });
        }

        // အောင်မြင်ကြောင်း ပြန်ကြားခြင်း
        return new Response(JSON.stringify({
            success: true,
            isBadgeUser: isBadge,
            files: uploadResults
        }), { headers });

    } catch (error) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: error.message 
        }), { status: 500, headers });
    }
}
  

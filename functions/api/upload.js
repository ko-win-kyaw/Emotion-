export async function onRequest(context) {
    const { request, env } = context;
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // CORS Preflight Request ကို ကိုင်တွယ်ခြင်း
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers });
    }
    
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), { 
            status: 405, 
            headers 
        });
    }

    try {
        const formData = await request.formData();
        const files = formData.getAll('file');
        const userId = formData.get('userId');

        if (!userId || !files.length) {
            return new Response(JSON.stringify({ success: false, error: "Missing userId or files" }), { 
                status: 400, 
                headers 
            });
        }

        // ၁။ Supabase Profile Check (Error တက်လည်း Application မရပ်စေရန် Catch လုပ်ထားသည်)
        let hasBadge = false;
        try {
            const userCheckRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=has_badge`, {
                headers: { 
                    'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` 
                }
            });
            
            if (userCheckRes.ok) {
                const userData = await userCheckRes.json();
                hasBadge = userData?.[0]?.has_badge || false;
            } else {
                console.error(`Supabase profile check failed with status: ${userCheckRes.status}`);
            }
        } catch (e) {
            console.error("Badge check network failed:", e);
        }

        // ကန့်သတ်ချက်များ သတ်မှတ်ခြင်း
        const maxFiles = hasBadge ? 10 : 1;
        const maxVideoSize = hasBadge ? 50 * 1024 * 1024 : 20 * 1024 * 1024;
        const maxImageSize = 5 * 1024 * 1024;

        // ၂။ Early Validation: ဖိုင်အရေအတွက် ပိုနေပါက စောစီးစွာ ဖြတ်ချခြင်း
        if (files.length > maxFiles) {
            return new Response(JSON.stringify({ success: false, error: `Max ${maxFiles} files allowed` }), { 
                status: 400, 
                headers 
            });
        }

        const uploadUrls = [];
        
        // ဖိုင်များကို တစ်ခုချင်းစီ စစ်ဆေးပြီး Upload တင်ခြင်း Loop
        for (const file of files) {
            const isVideo = file.type.startsWith('video/');
            const limit = isVideo ? maxVideoSize : maxImageSize;
            
            // ဖိုင်ဆိုက် ကြီးလွန်းနေပါက ချက်ချင်း တားဆီးခြင်း
            if (file.size > limit) {
                return new Response(JSON.stringify({ success: false, error: `${file.name} က သတ်မှတ်ထားထက် ကြီးနေပါသည်။` }), { 
                    status: 400, 
                    headers 
                });
            }

            // File Name သန့်စင်ခြင်း (မြန်မာစာနှင့် Special Characters များပါဝင်ပါက URL မပျက်စေရန်)
            const fileExtension = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
            const cleanFileName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}_${cleanFileName}.${fileExtension}`;
            let url = "";

            if (isVideo) {
                // ၃။ Bunny CDN Upload (Singapore Storage Endpoint သို့ တိုက်ရိုက်ချိတ်ဆက်ခြင်း)
                const buffer = await file.arrayBuffer();
                const bunnyRes = await fetch(`https://sg.storage.bunnycdn.com/${env.BUNNY_STORAGE_ZONE}/${fileName}`, {
                    method: 'PUT',
                    headers: { 
                        'AccessKey': env.BUNNY_KEY, 
                        'Content-Type': file.type || 'video/mp4',
                        'Content-Length': buffer.byteLength.toString() // ဗီဒီယို Stream အတွက် အရေးကြီးသည်
                    },
                    body: buffer
                });
                
                if (!bunnyRes.ok) {
                    const errorText = await bunnyRes.text().catch(() => "");
                    throw new Error(`Bunny Storage က လက်မခံပါ (Status: ${bunnyRes.status}) ${errorText}`);
                }
                
                url = `${env.BUNNY_PULL_ZONE_URL}/${fileName}`;
            } else {
                // ၄။ ImgBB Upload
                const imgbbForm = new FormData();
                imgbbForm.append('image', file);
                
                const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${env.IMGBB_KEY}`, {
                    method: 'POST',
                    body: imgbbForm
                });
                
                if (!imgbbRes.ok) {
                    throw new Error(`ImgBB API returns status ${imgbbRes.status}`);
                }
                
                const imgbbData = await imgbbRes.json();
                if (!imgbbData.success) {
                    throw new Error(`ImgBB upload failed: ${imgbbData.error?.message || 'Unknown error'}`);
                }
                url = imgbbData.data.url;
            }

            // ၅။ Database သို့ Log သွင်းခြင်း (DB ကြောင့် Upload process တစ်ခုလုံး မပြိုလဲစေရန် စနစ်တကျ ထိန်းထားသည်)
            try {
                const dbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/uploads`, {
                    method: 'POST',
                    headers: {
                        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal' // Network response သက်သာစေရန်
                    },
                    body: JSON.stringify({
                        url: url,
                        type: isVideo ? 'video' : 'image',
                        user_id: userId,
                        storage_provider: isVideo ? 'bunny' : 'imgbb',
                        file_size: file.size
                    })
                });

                if (!dbRes.ok) {
                    console.error(`DB Insert Failed but file uploaded: ${dbRes.statusText}`);
                }
            } catch (err) {
                console.error("DB Log Network Error:", err);
            }

            uploadUrls.push(url);
        }

        // အောင်မြင်မှု Response ပြန်ခြင်း
        return new Response(JSON.stringify({ 
            success: true, 
            urls: uploadUrls 
        }), { headers });
        
    } catch (err) {
        // ဘယ်နေရာကပဲ Error တက်တက် CORS Header မပျောက်စေရန် ဤနေရာတွင်လည်း သေချာထည့်သွင်းထားသည်
        return new Response(JSON.stringify({ 
            success: false, 
            error: err.message || "Internal Server Error"
        }), { 
            status: 500, 
            headers 
        });
    }
}

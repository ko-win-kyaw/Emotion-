export async function onRequest(context) {
    const { request, env } = context;
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

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
                console.error("Supabase returned non-OK status:", userCheckRes.status);
            }
        } catch (e) {
            console.error("Badge check network failed:", e);
        }

        const maxFiles = hasBadge ? 10 : 1;
        const maxVideoSize = hasBadge ? 50 * 1024 * 1024 : 20 * 1024 * 1024;
        const maxImageSize = 5 * 1024 * 1024;

        if (files.length > maxFiles) {
            return new Response(JSON.stringify({ success: false, error: `Max ${maxFiles} files allowed` }), { 
                status: 400, 
                headers 
            });
        }

        const uploadUrls = [];
        
        for (const file of files) {
            const isVideo = file.type.startsWith('video/');
            const limit = isVideo ? maxVideoSize : maxImageSize;
            
            if (file.size > limit) {
                return new Response(JSON.stringify({ success: false, error: `${file.name} exceeds size limit` }), { 
                    status: 400, 
                    headers 
                });
            }

            const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}_${cleanFileName}`;
            let url = "";

            if (isVideo) {
                // Bunny Storage သို့ ဗီဒီယိုတင်ခြင်း (Stream ပုံစံဖြင့် ပြင်ဆင်ထားသည်)
                const bunnyRes = await fetch(`https://storage.bunnycdn.com/${env.BUNNY_STORAGE_ZONE}/${fileName}`, {
                    method: 'PUT',
                    headers: { 
                        'AccessKey': env.BUNNY_KEY
                        // Content-Type ကို ဖယ်ရှားလိုက်ခြင်းဖြင့် Mime Type Reject ဖြစ်ခြင်းကို ကျော်လွှားသည်
                    },
                    body: file.stream() // Worker memory overload မဖြစ်အောင် stream သုံးသည်
                });
                
                if (!bunnyRes.ok) {
                    const errText = await bunnyRes.text();
                    console.error("BUNNY ERROR:", errText); // Error အသေးစိတ်ကို Worker Log တွင် ကြည့်ရန်
                    throw new Error(`Bunny upload failed (${bunnyRes.status})`);
                }
                
                // URL တွင် double slash (//) မဖြစ်အောင် replace လုပ်သည်
                url = `${env.BUNNY_PULL_ZONE_URL.replace(/\/$/, '')}/${fileName}`;
            } else {
                // ImgBB သို့ ဓာတ်ပုံတင်ခြင်း
                const imgbbForm = new FormData();
                imgbbForm.append('image', file);
                
                const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${env.IMGBB_KEY}`, {
                    method: 'POST',
                    body: imgbbForm
                });
                
                const imgbbData = await imgbbRes.json();
                
                if (!imgbbData.success) {
                    throw new Error(`ImgBB upload failed: ${imgbbData.error?.message || 'Unknown error'}`);
                }
                url = imgbbData.data.url;
            }

            // Database သို့ Log သွင်းခြင်း
            try {
                const dbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/uploads`, {
                    method: 'POST',
                    headers: {
                        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal' 
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
                    console.error("DB Insert Failed but file uploaded:", dbRes.statusText);
                }
            } catch (err) {
                console.error("DB Log Network Error:", err);
            }

            uploadUrls.push(url);
        }

        return new Response(JSON.stringify({ 
            success: true, 
            urls: uploadUrls 
        }), { headers });
        
    } catch (err) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: err.message || "Internal Server Error"
        }), { 
            status: 500, 
            headers 
        });
    }
                }
        

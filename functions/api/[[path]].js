// Cloudflare Pages Function: tüm /api/* istekleri
const TEMALAR=['klasik','gece','sage','gul'];
const DEFAULT={ana:"Ayşe",es:"Mehmet",tarih:"2027-06-12",saat:"18:00",mekan:"Mekân adı, İlçe, Şehir",harita:"",tema:"klasik",baslik:"Evliliğimize sizi bekliyoruz",iban:"",ibanAd:"",muzik:"",
  mesaj:"Hayatımızın en güzel gününde yanımızda olmanızı çok isteriz.",
  program:[["18:00","Karşılama"],["18:30","Nikâh"],["20:00","Yemek"],["21:00","Dans"]],foto:[],album:""};
const clip=(s,n)=>String(s==null?'':s).slice(0,n);
const slugify=s=>String(s||'').toLowerCase().replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
function clean(c){
  return {ana:clip(c.ana,40),es:clip(c.es,40),tarih:/^\d{4}-\d{2}-\d{2}$/.test(c.tarih)?c.tarih:DEFAULT.tarih,
    saat:/^\d{2}:\d{2}$/.test(c.saat)?c.saat:DEFAULT.saat,mekan:clip(c.mekan,200),harita:clip(c.harita,500),album:clip(c.album,500),
    tema:TEMALAR.includes(c.tema)?c.tema:'klasik',baslik:clip(c.baslik,80),iban:(s=>/^TR\d{24}$/.test(s)?s:'')(String(c.iban||'').replace(/\s/g,'').toUpperCase()),ibanAd:clip(c.ibanAd,60),muzik:(u=>{u=String(u||'').trim();const m=u.match(/(?:youtu\.be\/|[?&]v=|shorts\/|embed\/)([\w-]{11})/);return m?m[1]:(/^[\w-]{11}$/.test(u)?u:'')})(c.muzik),mesaj:clip(c.mesaj,500),
    program:(Array.isArray(c.program)?c.program:[]).slice(0,20).map(r=>[clip(r[0],10),clip(r[1],60)]),
    foto:(Array.isArray(c.foto)?c.foto:[]).slice(0,12).map(u=>clip(u,500)).filter(u=>/^(https:\/\/|\/api\/img\/)/.test(u))};
}
const enc=s=>new TextEncoder().encode(s);
async function hmac(key,msg){
  const k=await crypto.subtle.importKey('raw',enc(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',k,enc(msg)))));
}
const newToken=()=>crypto.randomUUID().replace(/-/g,'');
async function createInv(env,slug,cfg){
  const token=newToken();
  await env.DAVET.put('inv:'+slug,JSON.stringify({token,cfg:clean({...DEFAULT,...cfg})}));
  return token;
}
export async function onRequest({request,env,params}){
  const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
  const p=params.path||[];const a=p[0];const m=request.method;const slug=slugify(p[1]);
  try{
    /* --- yönetici: elle müşteri oluştur --- */
    if(a==='create'&&m==='POST'){
      if(!env.MASTER_KEY||request.headers.get('x-master')!==env.MASTER_KEY)return json({error:'Yetkisiz'},401);
      const b=await request.json();const s=slugify(b.slug);
      if(!s)return json({error:'Geçerli bir adres yazın'},400);
      if(await env.DAVET.get('inv:'+s))return json({error:'Bu adres kullanımda'},409);
      return json({slug:s,token:await createInv(env,s,b.cfg||{})});
    }
    /* --- satış: sipariş + PayTR iFrame token --- */
    if(a==='siparis'&&m==='POST'){
      if(!env.MERCHANT_ID||!env.MERCHANT_KEY||!env.MERCHANT_SALT)return json({error:'Ödeme sistemi henüz ayarlanmadı'},503);
      const b=await request.json();const s=slugify(b.slug);
      const email=clip(b.email,100);
      if(!s||s.length<3)return json({error:'Davetiye adresi en az 3 harf olmalı'},400);
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return json({error:'Geçerli bir e-posta yazın'},400);
      if(await env.DAVET.get('inv:'+s)||await env.DAVET.get('res:'+s))return json({error:'Bu adres alınmış, başka bir tane deneyin'},409);
      const oid=newToken();const tl=Number(env.FIYAT_TL||499);
      const test=env.TEST_MODE==='0'?'0':'1';
      const basket=btoa(JSON.stringify([["Dijital Davetiye",tl.toFixed(2),1]]));
      const ip=request.headers.get('CF-Connecting-IP')||'1.1.1.1';
      const amount=String(Math.round(tl*100));
      const origin=new URL(request.url).origin;
      const hs=env.MERCHANT_ID+ip+oid+email+amount+basket+'1'+'0'+'TL'+test;
      const body=new URLSearchParams({merchant_id:env.MERCHANT_ID,user_ip:ip,merchant_oid:oid,email,payment_amount:amount,
        paytr_token:await hmac(env.MERCHANT_KEY,hs+env.MERCHANT_SALT),user_basket:basket,debug_on:'1',no_installment:'1',max_installment:'0',
        user_name:clip(b.adsoyad,60)||'Musteri',user_address:'Dijital urun',user_phone:clip(b.tel,20)||'05000000000',
        merchant_ok_url:origin+'/tesekkurler.html?o='+oid,merchant_fail_url:origin+'/satis.html?hata=1',
        timeout_limit:'30',currency:'TL',test_mode:test,lang:'tr'});
      const r=await (await fetch('https://www.paytr.com/odeme/api/get-token',{method:'POST',body})).json();
      if(r.status!=='success')return json({error:'Ödeme başlatılamadı: '+clip(r.reason,150)},502);
      const cfg=clean({...DEFAULT,ana:b.ana,es:b.es,tarih:b.tarih,saat:b.saat,mekan:b.mekan,tema:b.tema,baslik:b.baslik||DEFAULT.baslik,mesaj:b.mesaj||DEFAULT.mesaj});
      await env.DAVET.put('res:'+s,oid,{expirationTtl:1800});
      await env.DAVET.put('order:'+oid,JSON.stringify({slug:s,cfg,email,durum:'bekliyor'}),{expirationTtl:86400*30});
      return json({token:r.token});
    }
    if(a==='siparis'&&m==='GET'){
      if(!/^[a-f0-9]{32}$/.test(p[1]||''))return json({error:'Bulunamadı'},404);
      const o=await env.DAVET.get('order:'+p[1],'json');
      if(!o)return json({error:'Bulunamadı'},404);
      if(o.durum!=='odendi')return json({durum:o.durum});
      return json({durum:'odendi',slug:o.slug,token:o.token});
    }
    if(a==='paytr-callback'&&m==='POST'){
      const f=await request.formData();
      const oid=f.get('merchant_oid')||'',st=f.get('status')||'',tot=f.get('total_amount')||'';
      const hash=await hmac(env.MERCHANT_KEY,oid+env.MERCHANT_SALT+st+tot);
      if(hash!==f.get('hash'))return new Response('bad hash',{status:400});
      const o=await env.DAVET.get('order:'+oid,'json');
      if(o&&o.durum==='bekliyor'){
        if(st==='success'){
          const kayit=await env.DAVET.get('inv:'+o.slug,'json');
          o.token=kayit?(o.token||newToken()):await createInv(env,o.slug,o.cfg);
          o.durum='odendi';await env.DAVET.put('order:'+oid,JSON.stringify(o),{expirationTtl:86400*90});
        }else{await env.DAVET.delete('res:'+o.slug);o.durum='basarisiz';await env.DAVET.put('order:'+oid,JSON.stringify(o),{expirationTtl:86400});}
      }
      return new Response('OK');
    }
    /* --- fotoğraf okuma (herkese açık, KV'de saklanır) --- */
    if(a==='img'&&m==='GET'){
      if(!/^[a-z0-9-]+$/.test(p[1]||'')||!/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(p[2]||''))return new Response('yok',{status:404});
      const r=await env.DAVET.getWithMetadata('img:'+p[1]+':'+p[2],'arrayBuffer');
      if(!r.value)return new Response('yok',{status:404});
      return new Response(r.value,{headers:{'content-type':(r.metadata&&r.metadata.ct)||'image/jpeg','cache-control':'public, max-age=31536000, immutable'}});
    }
    if(!slug)return json({error:'Bulunamadı'},404);
    const rec=await env.DAVET.get('inv:'+slug,'json');
    if(!rec)return json({error:'Davetiye bulunamadı'},404);
    const isAdmin=request.headers.get('x-token')===rec.token;
    if(a==='inv'){
      if(m==='GET')return json(rec.cfg);
      if(m==='POST'){if(!isAdmin)return json({error:'Yetkisiz'},401);
        rec.cfg=clean(await request.json());await env.DAVET.put('inv:'+slug,JSON.stringify(rec));return json({ok:true});}
    }
    if(a==='upload'&&m==='POST'){
      if(!isAdmin)return json({error:'Yetkisiz'},401);
      const ct=request.headers.get('content-type')||'';
      const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[ct];
      if(!ext)return json({error:'Yalnızca JPG, PNG veya WEBP'},400);
      const buf=await request.arrayBuffer();
      if(buf.byteLength>4e6)return json({error:'Dosya 4 MB üstünde'},413);
      const l=await env.DAVET.list({prefix:'img:'+slug+':',limit:50});
      if(l.keys.length>=12)return json({error:'En fazla 12 fotoğraf'},429);
      const name=crypto.randomUUID().replace(/-/g,'').slice(0,16)+'.'+ext;
      await env.DAVET.put('img:'+slug+':'+name,buf,{metadata:{ct}});
      return json({url:'/api/img/'+slug+'/'+name});
    }
    if(a==='rsvp'){
      if(m==='POST'){
        const b=await request.json();
        const r={ad:clip(b.ad,80),durum:b.durum==='Katılamıyorum'?'Katılamıyorum':'Katılıyorum',
          kisi:Math.min(20,Math.max(1,parseInt(b.kisi)||1)),not:clip(b.not,400),zaman:new Date().toISOString()};
        if(!r.ad)return json({error:'Adınızı yazın'},400);
        const {keys}=await env.DAVET.list({prefix:'rsvp:'+slug+':',limit:1000});
        if(keys.length>=1000)return json({error:'Yanıt sınırı doldu'},429);
        await env.DAVET.put('rsvp:'+slug+':'+Date.now()+':'+crypto.randomUUID().slice(0,6),JSON.stringify(r));
        return json({ok:true});
      }
      if(m==='GET'){if(!isAdmin)return json({error:'Yetkisiz'},401);
        const {keys}=await env.DAVET.list({prefix:'rsvp:'+slug+':',limit:1000});
        return json((await Promise.all(keys.map(k=>env.DAVET.get(k.name,'json')))).filter(Boolean));}
    }
    return json({error:'Bulunamadı'},404);
  }catch(e){return json({error:'Sunucu hatası'},500)}
}

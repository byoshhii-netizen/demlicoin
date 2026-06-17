const STATE = {
  wallet: null, ws: null, isAdmin: false,
  priceHistory: [], lastPrice: 0, prevPrice: 0,
  dayHigh: 0, dayLow: 999999, dayVol: 0, dayTrades: 0,
  reconnectTimer: null,
};
const WS_URL = (location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws';
async function api(path,opts={}){
  const res=await fetch(path,{headers:{'Content-Type':'application/json'},...opts});
  return res.json();
}

function switchPage(name,btn){
  document.querySelectorAll('.page').forEach(p=>{p.style.display='none';p.classList.remove('active');});
  const pg=document.getElementById('page-'+name);
  if(pg){pg.style.display='block';pg.classList.add('active');}
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  if(name==='toplist')loadToplist();
  if(name==='admin')loadAdminWallets();
}

function openWalletModal(){
  const info=document.getElementById('current-wallet-info');
  const addrEl=document.getElementById('modal-current-addr');
  if(STATE.wallet){info.style.display='block';addrEl.textContent=STATE.wallet.address;}
  else info.style.display='none';
  document.getElementById('wallet-modal').style.display='flex';
}
function closeWalletModal(){document.getElementById('wallet-modal').style.display='none';}

function logoutWallet(){
  STATE.wallet=null;STATE.isAdmin=false;
  STATE.ws&&STATE.ws.close();STATE.ws=null;
  localStorage.removeItem('dcw');
  document.getElementById('wallet-address-full').textContent='Cüzdan bağlı değil';
  document.getElementById('wp-balance').textContent='0';
  document.getElementById('wp-usd').textContent='≈ $0.00 USD';
  document.getElementById('wallet-mini').style.display='none';
  document.getElementById('nav-admin').style.display='none';
  document.getElementById('chat-hint-bar').style.display='none';
  document.getElementById('chat-anon-label').textContent='Giris yap';
  document.getElementById('page-admin').style.display='none';
  closeWalletModal();showFloat('Çıkış yapıldı','info');
}

async function generateWallet(){
  const data=await api('/api/wallet/new');
  document.getElementById('wallet-modal-content').innerHTML=`
    <div class="wallet-new-result">
      <div><div class="key-label">ADRES</div><div class="key-value">${data.address}</div></div>
      <div><div class="key-label">PRIVATE KEY <span class="key-warn">(gizli tut!)</span></div><div class="key-value">${data.priv_key}</div></div>
    </div>
    <p style="font-size:10px;color:var(--red);text-align:center;">Bu bilgileri kaybet = cüzdanı kaybet.</p>
    <button class="btn-primary" onclick="loginWith('${data.priv_key}','${data.address}','${data.pub_key}')">
      <i class="fa-solid fa-right-to-bracket"></i> Bu Cüzdanla Giriş Yap
    </button>`;
}

async function importWallet(){
  const pk=document.getElementById('import-privkey').value.trim();
  if(!pk){showFloat('Private key boş','err');return;}
  const r=await api('/api/wallet/import',{method:'POST',body:JSON.stringify({priv_key:pk})});
  if(r.hata){showFloat('Geçersiz key: '+r.hata,'err');return;}
  loginWith(pk,r.address,r.pub_key);
}

function loginWith(privKey,address,pubKey){
  STATE.wallet={privKey,address,pubKey};
  localStorage.setItem('dcw',JSON.stringify(STATE.wallet));
  const anonName='@Dem_'+address.slice(3,9);
  document.getElementById('wallet-address-full').textContent=address;
  document.getElementById('chat-hint-bar').style.display='block';
  document.getElementById('anon-name-display').textContent=anonName;
  document.getElementById('chat-anon-label').textContent='Sen: '+anonName;
  document.getElementById('wallet-mini').style.display='flex';
  closeWalletModal();
  connectWS();refreshBalance();checkAdmin(address);
}

async function checkAdmin(address){
  const s=await api('/api/state');
  if(s.founder_address&&s.founder_address===address){
    STATE.isAdmin=true;
    document.getElementById('nav-admin').style.display='flex';
    document.getElementById('page-admin').style.display='';
    loadPriceSettings();loadAdminWallets();
  }
}

async function refreshBalance(){
  if(!STATE.wallet)return;
  const d=await api('/api/wallet/'+STATE.wallet.address+'/balance');
  const bal=parseFloat(d.balance||0);
  const fmt=bal.toLocaleString('tr-TR',{maximumFractionDigits:2});
  document.getElementById('wp-balance').textContent=fmt;
  document.getElementById('mini-balance').textContent=fmt;
  const usd=(bal*STATE.lastPrice).toFixed(2);
  document.getElementById('wp-usd').textContent='≈ $'+usd+' USD';
  document.getElementById('mini-usd').textContent='$'+usd;
  document.getElementById('balance-num')&&(document.getElementById('balance-num').textContent=fmt);
}

function connectWS(){
  if(!STATE.wallet)return;
  if(STATE.ws&&STATE.ws.readyState<2)STATE.ws.close();
  STATE.ws=new WebSocket(WS_URL+'?address='+encodeURIComponent(STATE.wallet.address));
  STATE.ws.onopen=()=>{setNetStatus(true);clearTimeout(STATE.reconnectTimer);};
  STATE.ws.onmessage=e=>handleMsg(JSON.parse(e.data));
  STATE.ws.onclose=()=>{setNetStatus(false);STATE.reconnectTimer=setTimeout(connectWS,3000);};
}

function handleMsg(msg){
  switch(msg.type){
    case 'NEW_BLOCK': addBlock(msg.payload);refreshBalance();break;
    case 'CHAT': appendChat(msg.payload);break;
    case 'PRICE': onPriceUpdate(msg.payload.price,msg.payload.history);break;
    case 'DELETE_MSG': deleteChatMsg(msg.payload);break;
    case 'STATE':
      if(msg.payload.balance!==undefined)refreshBalance();
      if(msg.payload.network)updateStats(msg.payload.network);
      break;
    case 'ALERT': handleAlert(msg.payload.event);break;
    case 'ERROR': showFloat(msg.payload,'err');break;
  }
}

function onPriceUpdate(price,history){
  STATE.prevPrice=STATE.lastPrice||price;
  STATE.lastPrice=price;
  if(history&&history.length)STATE.priceHistory=history;
  const fmt=price.toFixed(4);
  document.getElementById('chart-price').textContent=fmt;
  const tickerEl=document.getElementById('ticker-content');
  const change=STATE.prevPrice>0?((price-STATE.prevPrice)/STATE.prevPrice*100):0;
  const badge=document.getElementById('price-change-badge');
  badge.textContent=(change>=0?'+':'')+change.toFixed(2)+'%';
  badge.className='price-badge '+(change>=0?'up':'down');
  if(price>STATE.dayHigh)STATE.dayHigh=price;
  if(price<STATE.dayLow&&price>0)STATE.dayLow=price;
  document.getElementById('cs-high').textContent=STATE.dayHigh.toFixed(4);
  document.getElementById('cs-low').textContent=STATE.dayLow.toFixed(4);
  document.getElementById('cs-vol').textContent=STATE.dayVol.toLocaleString('tr-TR',{maximumFractionDigits:0})+' DEM';
  document.getElementById('cs-trades').textContent=STATE.dayTrades;
  if(tickerEl){
    tickerEl.textContent=`DEM/USD: ${fmt} | 24S: ${change>=0?'+':''}${change.toFixed(2)}% | YUK: ${STATE.dayHigh.toFixed(4)} | DUS: ${STATE.dayLow.toFixed(4)} | HACIM: ${STATE.dayVol.toFixed(0)} DEM`;
  }
  if(STATE.wallet)refreshBalance();
  drawPriceChart();
}

function addBlock(b){
  const list=document.getElementById('block-list');
  const d=document.createElement('div');d.className='block-item';
  const hash=b.hash?b.hash.slice(0,14)+'...':'—';
  const t=new Date(b.timestamp).toLocaleTimeString('tr-TR');
  const txc=b.transactions?b.transactions.length:0;
  d.innerHTML=`<div class="block-item-top"><span class="block-num">#${b.index}</span><span class="block-time">${t}</span></div>
    <div class="block-hash">${hash}</div><div class="block-txs">${txc} işlem</div>`;
  list.insertBefore(d,list.firstChild);
  const cnt=list.children.length;
  document.getElementById('block-count-label').textContent=cnt+' blok';
  document.getElementById('hdr-block').textContent=b.index;
  document.getElementById('stat-blocks').textContent=b.index;
  document.getElementById('cs-block').textContent=b.index;
  STATE.dayTrades+=txc;
}

function appendChat(cm){
  const box=document.getElementById('chat-messages');
  const isMe=STATE.wallet&&cm.from===STATE.wallet.address;
  const isBot=cm.from&&cm.from.startsWith('DEM_BOT_');
  const t=new Date(cm.timestamp).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const d=document.createElement('div');d.className='chat-msg';d.dataset.id=cm.id;
  const delBtn=STATE.isAdmin?`<button class="chat-del-btn" onclick="deleteChat(${cm.id})"><i class="fa-solid fa-trash"></i></button>`:'';
  const cls=isMe?'me':isBot?'bot':'';
  d.innerHTML=`<div class="chat-msg-top"><span class="chat-ts">${t}</span><span class="chat-user ${cls}">${cm.username}</span>${delBtn}</div>
    <div class="chat-text">${esc(cm.content)}</div>`;
  box.appendChild(d);box.scrollTop=box.scrollHeight;
}

function deleteChatMsg(id){
  const el=document.querySelector(`.chat-msg[data-id="${id}"]`);
  if(el)el.classList.add('deleted');
}

async function deleteChat(id){
  if(!STATE.wallet||!STATE.isAdmin)return;
  const ir=await api('/api/admin/imza-olustur',{method:'POST',body:JSON.stringify({priv_key:STATE.wallet.privKey,veri:`DeleteChat:${id}`})});
  if(ir.hata)return;
  await api('/api/chat/delete',{method:'POST',body:JSON.stringify({imza:ir.imza,id})});
}

function addTradeItem(t){
  const list=document.getElementById('trades-list');
  const d=document.createElement('div');d.className='trade-item';
  const time=new Date(t.time||Date.now()).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const amt=parseFloat(t.amount||0).toFixed(2);
  const hash=(t.hash||'').slice(0,10)+'...';
  d.innerHTML=`<div class="trade-top"><span class="trade-users">${t.from||'?'} → ${t.to||'?'}</span><span class="trade-amount in">+${amt} DEM</span></div>
    <div class="trade-hash">${hash} · ${time}</div>`;
  list.insertBefore(d,list.firstChild);
  if(list.children.length>50)list.lastChild.remove();
  STATE.dayVol+=parseFloat(t.amount||0);
  STATE.dayTrades++;
}

function updateStats(net){
  const locked=net.locked;
  const el=document.getElementById('stat-locked');
  el.textContent=locked?'Kilitli':'Aktif';
  el.className='stat-val '+(locked?'red':'green');
  const badge=document.getElementById('net-badge');
  badge.className='badge'+(locked?' locked':'');
  badge.innerHTML=`<i class="fa-solid fa-circle-dot"></i> ${locked?'KİLİTLİ':'CANLI'}`;
  const supply=parseFloat(net.total_supply||0).toLocaleString('tr-TR');
  document.getElementById('stat-supply').textContent=supply+' DEM';
}

function handleAlert(ev){
  if(!ev)return;
  if(ev==='AG_KILITLANDI')showFloat('Ağ kilitlendi','err');
  else if(ev==='AG_ACILDI')showFloat('Ağ kilidi açıldı','ok');
  else if(ev==='ARZ_SABITLENDI')showFloat('Arz sabitlendi 50M DEM','info');
}

function setNetStatus(online){
  const badge=document.getElementById('net-badge');
  badge.className='badge'+(online?'':' locked');
  badge.innerHTML=`<i class="fa-solid fa-circle-dot"></i> ${online?'CANLI':'BAĞLANTISIZ'}`;
}

async function doTransfer(){
  if(!STATE.wallet){openWalletModal();return;}
  const to=document.getElementById('to-address').value.trim();
  const amount=parseFloat(document.getElementById('transfer-amount').value);
  if(!to||isNaN(amount)||amount<=0){setResult('transfer-result','Geçersiz bilgi','err');return;}
  const sigData=STATE.wallet.address+to+amount.toFixed(8);
  const ir=await api('/api/admin/imza-olustur',{method:'POST',body:JSON.stringify({priv_key:STATE.wallet.privKey,veri:sigData})});
  if(ir.hata){setResult('transfer-result','İmza hatası','err');return;}
  const r=await api('/api/transfer',{method:'POST',body:JSON.stringify({from:STATE.wallet.address,to,amount,signature:ir.imza,pub_key:STATE.wallet.pubKey})});
  if(r.hata){setResult('transfer-result',r.hata,'err');}
  else{
    setResult('transfer-result','Transfer tamam — '+r.tx_hash,'ok');
    document.getElementById('to-address').value='';
    document.getElementById('transfer-amount').value='';
    refreshBalance();
    showTxNotify('Transfer Başarılı',amount+' DEM gönderildi');
    addTradeItem({from:'@Dem_'+STATE.wallet.address.slice(3,9),to:'@Dem_'+(to.slice(3,9)||'???'),amount,hash:r.tx_hash,time:new Date()});
  }
}

function sendChat(){
  if(!STATE.wallet){openWalletModal();return;}
  if(!STATE.ws||STATE.ws.readyState!==1){showFloat('Bağlantı yok','err');return;}
  const input=document.getElementById('chat-input');
  const content=input.value.trim();if(!content)return;
  STATE.ws.send(JSON.stringify({type:'CHAT',payload:{content}}));
  input.value='';
}

async function adminCmd(cmd){
  if(!STATE.wallet)return;
  let veri,endpoint,extra={},resultId='admin-net-result';
  if(cmd==='kilitle'){veri='AgiKilitle';endpoint='/api/admin/kilitle';}
  else if(cmd==='ac'){veri='AgiAc';endpoint='/api/admin/ac';}
  else if(cmd==='arz'){if(!confirm('Arzı sabitlemek geri alınamaz.'))return;veri='ArzSabitle';endpoint='/api/admin/arz-sabitle';}
  else if(cmd==='yasakla'){
    const adres=document.getElementById('ban-address').value.trim();
    if(!adres){setResult('admin-token-result','Adres boş','err');return;}
    veri='CuzdanYasakla:'+adres;endpoint='/api/admin/yasakla';extra={adres};resultId='admin-token-result';
  }else if(cmd==='mint'){
    const adres=document.getElementById('mint-address').value.trim();
    const miktar=parseFloat(document.getElementById('mint-amount').value);
    if(!adres||isNaN(miktar)){setResult('admin-token-result','Geçersiz bilgi','err');return;}
    veri='TokenBas:'+adres;endpoint='/api/admin/token-bas';extra={adres,miktar};resultId='admin-token-result';
  }
  const ir=await api('/api/admin/imza-olustur',{method:'POST',body:JSON.stringify({priv_key:STATE.wallet.privKey,veri})});
  if(ir.hata){setResult(resultId,'İmza hatası','err');return;}
  const r=await api(endpoint,{method:'POST',body:JSON.stringify({imza:ir.imza,...extra})});
  setResult(resultId,r.hata?r.hata:(r.mesaj||'Tamam'),r.hata?'err':'ok');
  if(!r.hata&&cmd==='mint')showTxNotify('Token Basıldı',extra.miktar+' DEM');
  refreshBalance();
}

async function loadToplist(){
  const list=await api('/api/toplist');
  const tbody=document.getElementById('toplist-body');
  if(!Array.isArray(list)||list.length===0){tbody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Henüz veri yok</td></tr>';return;}
  const rankClass=i=>i===0?'gold':i===1?'silver':i===2?'bronze':'';
  tbody.innerHTML=list.map((r,i)=>`
    <tr>
      <td><span class="tl-rank ${rankClass(i)}">#${i+1}</span></td>
      <td><div class="tl-user">${r.username||'@Dem_???'}</div></td>
      <td><div class="tl-addr">${r.address}</div></td>
      <td><span class="tl-bal">${parseFloat(r.balance||0).toLocaleString('tr-TR',{maximumFractionDigits:2})} DEM</span></td>
    </tr>`).join('');
}

async function loadAdminWallets(){
  if(!STATE.wallet||!STATE.isAdmin)return;
  const ir=await api('/api/admin/imza-olustur',{method:'POST',body:JSON.stringify({priv_key:STATE.wallet.privKey,veri:'AdminWallets'})});
  if(ir.hata)return;
  const list=await api('/api/admin/wallets?imza='+encodeURIComponent(ir.imza));
  const tbody=document.getElementById('admin-wallet-body');
  if(!Array.isArray(list)||list.length===0){tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px;">Henüz cüzdan yok</td></tr>';return;}
  tbody.innerHTML=list.map(w=>`
    <tr>
      <td style="font-weight:600;color:var(--gold);">${w.username}</td>
      <td><span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--text-muted);">${w.address}</span></td>
      <td><span style="font-family:'JetBrains Mono',monospace;font-weight:600;color:var(--green);">${parseFloat(w.balance||0).toFixed(2)}</span></td>
      <td><span style="font-size:10px;color:${w.blacklisted?'var(--red)':'var(--text-muted)'};">${w.blacklisted?'Yasaklı':w.muted?'Muted':w.trade_ban?'Ticaret Yasak':'Normal'}</span></td>
      <td><div class="aw-actions">
        <button class="aw-btn mute${w.muted?' on':''}" onclick="toggleWalletRestrict('${w.address}','${w.username}',${!w.muted},${w.trade_ban||false})">
          ${w.muted?'Muted':'Mute'}
        </button>
        <button class="aw-btn ban${w.trade_ban?' on':''}" onclick="toggleWalletRestrict('${w.address}','${w.username}',${w.muted||false},${!w.trade_ban})">
          ${w.trade_ban?'Yasaklı':'Yasakla'}
        </button>
      </div></td>
    </tr>`).join('');
}

async function toggleWalletRestrict(address,username,muted,tradeBan){
  if(!STATE.wallet)return;
  const ir=await api('/api/admin/imza-olustur',{method:'POST',body:JSON.stringify({priv_key:STATE.wallet.privKey,veri:'Restrict:'+address})});
  if(ir.hata)return;
  await api('/api/users/restrict',{method:'POST',body:JSON.stringify({imza:ir.imza,adres:address,username,muted,trade_ban:tradeBan})});
  showFloat('Kısıtlama güncellendi','info');
  loadAdminWallets();
}

async function loadPriceSettings(){
  const s=await api('/api/price/settings');
  if(s.hata)return;
  document.getElementById('ps-artma').value=s.artma_orani||52;
  document.getElementById('ps-degisim').value=s.max_degisim||4;
  document.getElementById('ps-sure').value=s.guncelleme_suresi||3000;
  document.getElementById('ps-min').value=s.min_deger||0.001;
  document.getElementById('ps-max').value=s.max_deger||100;
}

async function savePriceSettings(){
  if(!STATE.wallet)return;
  const ir=await api('/api/admin/imza-olustur',{method:'POST',body:JSON.stringify({priv_key:STATE.wallet.privKey,veri:'PriceSettings'})});
  if(ir.hata){setResult('admin-price-result','İmza hatası','err');return;}
  const r=await api('/api/price/settings',{method:'POST',body:JSON.stringify({
    imza:ir.imza,
    artma_orani:parseFloat(document.getElementById('ps-artma').value)||52,
    max_degisim:parseFloat(document.getElementById('ps-degisim').value)||4,
    guncelleme_suresi:parseInt(document.getElementById('ps-sure').value)||3000,
    min_deger:parseFloat(document.getElementById('ps-min').value)||0.001,
    max_deger:parseFloat(document.getElementById('ps-max').value)||100,
  })});
  setResult('admin-price-result',r.hata?r.hata:'Ayarlar kaydedildi',r.hata?'err':'ok');
}

async function setDirectPrice(){
  if(!STATE.wallet)return;
  const fiyat=parseFloat(document.getElementById('ps-fiyat').value);
  if(isNaN(fiyat)||fiyat<=0){setResult('admin-price-result','Geçersiz fiyat','err');return;}
  const ir=await api('/api/admin/imza-olustur',{method:'POST',body:JSON.stringify({priv_key:STATE.wallet.privKey,veri:'SetPrice'})});
  if(ir.hata){setResult('admin-price-result','İmza hatası','err');return;}
  const r=await api('/api/price/set',{method:'POST',body:JSON.stringify({imza:ir.imza,fiyat})});
  setResult('admin-price-result',r.hata?r.hata:'Fiyat '+fiyat+' olarak ayarlandı',r.hata?'err':'ok');
}

const canvas=document.getElementById('canvas-chart');
const ctx=canvas.getContext('2d');

function drawPriceChart(){
  const pts=STATE.priceHistory;
  if(!pts||pts.length<2){
    const W=canvas.offsetWidth||600;const H=180;
    canvas.width=W;canvas.height=H;ctx.clearRect(0,0,W,H);
    ctx.beginPath();ctx.strokeStyle='rgba(34,197,94,0.3)';ctx.lineWidth=1;
    ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();
    return;
  }
  const W=canvas.offsetWidth||600;const H=180;
  canvas.width=W;canvas.height=H;ctx.clearRect(0,0,W,H);
  const vals=pts.map(p=>p.value);
  const min=Math.min(...vals)*0.998;const max=Math.max(...vals)*1.002;
  const range=max-min||0.0001;
  const step=W/(pts.length-1);
  const toY=v=>H-6-((v-min)/range)*(H-16);
  ctx.beginPath();ctx.strokeStyle='rgba(255,255,255,0.03)';ctx.lineWidth=1;
  for(let i=1;i<5;i++){const y=(H/5)*i;ctx.moveTo(0,y);ctx.lineTo(W,y);}ctx.stroke();
  const isUp=pts[pts.length-1].value>=pts[0].value;
  const lc=isUp?'#22c55e':'#ef4444';
  const gc0=isUp?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)';
  ctx.beginPath();
  pts.forEach((p,i)=>{const x=i*step;const y=toY(p.value);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();
  const grad=ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,gc0);grad.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=grad;ctx.fill();
  ctx.beginPath();
  pts.forEach((p,i)=>{const x=i*step;const y=toY(p.value);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.strokeStyle=lc;ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();
  const lx=(pts.length-1)*step;const ly=toY(pts[pts.length-1].value);
  ctx.beginPath();ctx.arc(lx,ly,3,0,Math.PI*2);
  ctx.fillStyle='#f59e0b';ctx.shadowColor='#f59e0b';ctx.shadowBlur=8;ctx.fill();ctx.shadowBlur=0;
  ctx.font='9px JetBrains Mono';ctx.fillStyle='rgba(100,116,139,0.7)';
  ctx.fillText(max.toFixed(4),4,12);ctx.fillText(min.toFixed(4),4,H-3);
}

function showTxNotify(title,sub){
  const el=document.getElementById('tx-notify');
  document.getElementById('tx-notify-title').textContent=title;
  document.getElementById('tx-notify-sub').textContent=sub;
  el.style.display='flex';
  setTimeout(()=>el.style.display='none',4000);
}
function setResult(id,msg,type){const el=document.getElementById(id);if(!el)return;el.textContent=msg;el.className='result-msg '+type;}
function showFloat(msg,type='ok'){
  const el=document.getElementById('float-msg');
  el.textContent=msg;el.className='float-msg '+type;el.style.display='block';
  clearTimeout(el._t);el._t=setTimeout(()=>el.style.display='none',4000);
}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
window.addEventListener('resize',drawPriceChart);

async function init(){
  const blocks=await api('/api/blocks?limit=20');
  if(Array.isArray(blocks))[...blocks].reverse().forEach(addBlock);
  const state=await api('/api/state');
  if(state.network)updateStats(state.network);
  document.getElementById('hdr-online').textContent=state.online||0;
  document.getElementById('stat-online').textContent=state.online||0;
  const chat=await api('/api/chat/history');
  if(Array.isArray(chat))chat.forEach(appendChat);
  const trades=await api('/api/trades/recent');
  if(Array.isArray(trades))trades.forEach(addTradeItem);
  const priceHist=await api('/api/price/history');
  if(Array.isArray(priceHist)&&priceHist.length){
    STATE.priceHistory=priceHist;
    const last=priceHist[priceHist.length-1].value;
    STATE.lastPrice=last;
    document.getElementById('chart-price').textContent=last.toFixed(4);
    drawPriceChart();
  }
  const saved=localStorage.getItem('dcw');
  if(saved){
    try{
      const w=JSON.parse(saved);
      STATE.wallet=w;
      const anonName='@Dem_'+w.address.slice(3,9);
      document.getElementById('wallet-address-full').textContent=w.address;
      document.getElementById('chat-hint-bar').style.display='block';
      document.getElementById('anon-name-display').textContent=anonName;
      document.getElementById('chat-anon-label').textContent='Sen: '+anonName;
      document.getElementById('wallet-mini').style.display='flex';
      connectWS();refreshBalance();checkAdmin(w.address);
    }catch{localStorage.removeItem('dcw');}
  }
}

setInterval(async()=>{
  const s=await api('/api/state');
  document.getElementById('hdr-online').textContent=s.online||0;
  document.getElementById('stat-online').textContent=s.online||0;
},15000);
setInterval(refreshBalance,20000);

init();

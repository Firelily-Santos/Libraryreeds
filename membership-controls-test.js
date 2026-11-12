// TEST-ONLY CONTROLS. No live callable or live access claims.
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
const app=getApps().length ? getApp() : initializeApp({
  apiKey:'AIzaSyBqh6sJzEA5Mkg27tkXDgRTvog_QJ_zUtg',authDomain:'libraryreeds-638f4.firebaseapp.com',
  projectId:'libraryreeds-638f4',storageBucket:'libraryreeds-638f4.firebasestorage.app',
  messagingSenderId:'768304310517',appId:'1:768304310517:web:39b931e6447043d84d3dbc'
});
const auth=getAuth(app), call=httpsCallable(getFunctions(app,'us-central1'),'lrMembershipTest',{timeout:120000});
const host=document.getElementById('lrMembershipPanel');
const ctas=[...document.querySelectorAll('.cta[data-tier]')];
let state=null,busy=false,epoch=0;
const money=(amount,currency='usd')=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(amount/100);
const date=seconds=>seconds ? new Date(seconds*1000).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}) : 'your renewal date';
const byId=id=>document.getElementById(id);
const style=document.createElement('style');style.textContent=`
.lr-member{border:1px solid #343438;border-radius:12px;background:#111217;padding:26px;color:#f4f4f5;font-family:inherit;line-height:1.65;margin:18px 0 28px}
.lr-member h2{font-size:1.4rem;margin:0 0 10px;color:#c5a880}.lr-member p{font-size:.85rem;margin:8px 0;color:#b9b9c1}
.lr-member label{font-size:.8rem;display:block;margin:10px 0}.lr-member select,.lr-member input{background:#08090d;color:#f4f4f5;border:1px solid #555;padding:12px;width:100%;border-radius:5px;font:inherit}
.lr-member-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.lr-member button,.lr-member-dialog button{padding:11px 16px;border:1px solid #c5a880;border-radius:5px;background:#c5a880;color:#111;font:inherit;font-size:.8rem;cursor:pointer}
.lr-member button.secondary,.lr-member-dialog button.secondary{background:transparent;color:#c5a880}.lr-member button:disabled,.lr-member-dialog button:disabled{opacity:.5;cursor:wait}
.lr-member [hidden]{display:none!important}.lr-member-dialog{background:#111217;color:#f4f4f5;border:1px solid #c5a880;border-radius:12px;padding:26px;max-width:470px;width:calc(100% - 32px);margin:auto;line-height:1.7;font-family:inherit}
.lr-member-dialog::backdrop{background:rgba(0,0,0,.78)}.lr-member-dialog p{margin:16px 0}.lr-member-dialog h2{font-size:1.3rem}.lr-member-error{color:#ffb7b7!important}
`;
document.head.append(style);
host.classList.add('lr-member');
host.innerHTML=`<h2>Your membership</h2><p id="lrMemberSummary">Checking your membership…</p><p id="lrMemberDates"></p>
<p id="lrMemberPending"></p><p id="lrMemberHelp" hidden>Already paying for a membership? Contact Library Reeds to connect your existing subscription before joining again.</p>
<div id="lrMemberPlanControls" hidden><label for="lrMemberPlan">Choose a plan for your next renewal</label><select id="lrMemberPlan"></select>
<div class="lr-member-actions"><button type="button" id="lrMemberChange">Review plan change</button></div></div>
<div class="lr-member-actions"><button type="button" id="lrMemberCancel" class="secondary" hidden>Cancel membership</button>
<button type="button" id="lrMemberKeep" hidden>Keep my membership</button><button type="button" id="lrMemberRefresh" class="secondary">Refresh status</button></div>
<p id="lrMemberFeedback" role="status" aria-live="polite"></p>
<p>Plan changes begin at your next renewal. Cancellation stops renewal and keeps access through the paid period. New memberships use secure Stripe checkout.</p>
<details id="lrMemberAdmin" hidden><summary>Connect an existing member · Administrator</summary>
<p>Verify that these records belong to the same person before connecting them.</p>
<label>Website Firebase UID<input id="lrLegacyUid" autocomplete="off"></label><label>Stripe subscription ID<input id="lrLegacySub" placeholder="sub_…" autocomplete="off"></label>
<button type="button" id="lrLegacyLink">Review account connection</button></details>`;
const dialog=document.createElement('dialog');dialog.className='lr-member-dialog';
dialog.innerHTML='<h2 id="lrConfirmTitle"></h2><p id="lrConfirmBody"></p><div class="lr-member-actions"><button type="button" id="lrConfirmAccept">Confirm</button><button type="button" class="secondary" id="lrConfirmBack">Go back</button></div>';
dialog.setAttribute('aria-labelledby','lrConfirmTitle');document.body.append(dialog);
function feedback(text,error=false){const el=byId('lrMemberFeedback');el.textContent=text;el.classList.toggle('lr-member-error',error);}
function lock(value){busy=value;host.querySelectorAll('button,select,input').forEach(el=>el.disabled=value);ctas.forEach(el=>el.disabled=value||(!state&&!!auth.currentUser));}
function confirmAction(title,body){
  byId('lrConfirmTitle').textContent=title;byId('lrConfirmBody').textContent=body;
  return new Promise(resolve=>{
    const finish=result=>{dialog.close();byId('lrConfirmAccept').onclick=null;byId('lrConfirmBack').onclick=null;dialog.oncancel=null;resolve(result);};
    byId('lrConfirmAccept').onclick=()=>finish(true);byId('lrConfirmBack').onclick=()=>finish(false);
    dialog.oncancel=e=>{e.preventDefault();finish(false);};dialog.showModal();
  });
}
function render(){
  const m=state?.membership;
  byId('lrMemberHelp').hidden=!!m;
  byId('lrMemberPlanControls').hidden=!m?.canChange;
  byId('lrMemberCancel').hidden=!m||m.cancelAtPeriodEnd;
  byId('lrMemberKeep').hidden=!m?.cancelAtPeriodEnd;
  byId('lrMemberSummary').textContent=m ? `${m.name} · ${money(m.amount,m.currency)}/${m.cycle==='yearly'?'year':'month'} · ${m.status.replaceAll('_',' ')}` : auth.currentUser ? 'No current membership is connected to this account.' : 'Sign in to view or manage your membership.';
  byId('lrMemberDates').textContent=m ? (m.cancelAtPeriodEnd ? `Scheduled to end ${date(m.periodEnd)}. No renewal is scheduled.` : `Current billing period ends ${date(m.periodEnd)}.`) : '';
  byId('lrMemberPending').textContent=m?.pendingPlan ? `Scheduled change: ${m.pendingName} (${m.pendingCycle}) on ${date(m.periodEnd)}.` : '';
  const select=byId('lrMemberPlan');select.replaceChildren();
  for(const plan of state?.plans||[]) select.add(new Option(`${plan.name} · ${money(plan.amount,plan.currency)}/${plan.cycle==='yearly'?'year':'month'}`,plan.key));
  if(m) select.value=m.pendingPlan||m.plan;
  for(const btn of ctas){
    const text=btn.querySelector('.cta-text');if(text)text.textContent=auth.currentUser ? (m?'Review '+btn.dataset.tier+' plan →':'Join '+btn.dataset.tier+' →') : 'Sign in to choose this plan →';
  }
  // Stripe's verified prices replace the old hard-coded amounts after sign-in.
  for(const card of document.querySelectorAll('.slab')){
    const tier=card.querySelector('.cta')?.dataset.tier;
    const monthly=state?.plans.find(p=>p.tier===tier&&p.cycle==='monthly');
    const yearly=state?.plans.find(p=>p.tier===tier&&p.cycle==='yearly');
    const nums=card.querySelectorAll('.price-roll .num');
    if(nums[0])nums[0].textContent=monthly ? (monthly.amount/100).toFixed(2) : '—';
    if(nums[1])nums[1].textContent=yearly ? (yearly.amount/100).toFixed(2) : '—';
  }
  byId('lrMemberAdmin').hidden=true;
  renderTestAudit();
  lock(busy);
}
async function refresh(){
  const token=++epoch;state=null;lock(true);render();
  if(auth.currentUser)byId('lrMemberSummary').textContent='Checking your membership…';
  try{
    if(auth.currentUser){const result=await call({action:'status'});if(token!==epoch)return;state=result.data;}
    if(token!==epoch)return;render();
  }catch(error){if(token!==epoch)return;byId('lrMemberSummary').textContent='Membership status is unavailable.';feedback(error.message||'Unable to load membership. Try refreshing.',true);}
  finally{if(token===epoch)lock(false);}
}
async function act(payload,success){
  lock(true);const token=epoch;
  try{
    const result=await call(payload);if(token!==epoch)return;
    if(result.data.url){const url=new URL(result.data.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw new Error('Unexpected checkout address.');window.location.assign(url.href);return;}
    if(payload.action==='linkLegacy')await refresh();else{state=result.data;render();}
    feedback(success);auth.currentUser?.getIdToken(true).catch(()=>{});
  }catch(error){if(token===epoch){feedback(error.message||'The update failed. Refresh to check the current status.',true);}}
  finally{if(token===epoch)lock(false);}
}
async function choose(planKey){
  if(!auth.currentUser){window.location.assign('./login.html');return;}
  if(busy)return;
  const plan=state?.plans.find(p=>p.key===planKey);if(!plan){feedback('Refresh membership status before choosing a plan.',true);return;}
  const m=state.membership;
  if(m&&!m.canChange){feedback('Your membership cannot change plans right now. Review its status above.',true);return;}
  if(m&&m.plan===plan.key&&!m.pendingPlan){feedback('You already have this plan.');return;}
  const token=epoch;
  const message=m ? `Switch to ${plan.name} at ${money(plan.amount,plan.currency)} per ${plan.cycle==='yearly'?'year':'month'} starting ${date(m.periodEnd)}. No charge today. Any previously scheduled plan change will be replaced.` : `Start ${plan.name} at ${money(plan.amount,plan.currency)} per ${plan.cycle==='yearly'?'year':'month'}. You will continue to secure Stripe checkout for the first payment. If you already pay for a membership, go back and ask Library Reeds to connect it first.`;
  if(!await confirmAction(m?'Confirm plan change':'Start membership',message)||token!==epoch||busy)return;
  await act(m?{action:'change',plan:plan.key,subscriptionEnd:m.periodEnd}:{action:'start',plan:plan.key},'Your plan change is scheduled.');
}
byId('lrMemberChange').onclick=()=>choose(byId('lrMemberPlan').value);
byId('lrMemberRefresh').onclick=()=>{feedback('');refresh();};
byId('lrMemberCancel').onclick=async()=>{
  const m=state?.membership,token=epoch;if(!m||busy)return;
  if(!await confirmAction('Cancel membership?',`Your membership will not renew. Access continues through the paid period ending ${date(m.periodEnd)}. Any scheduled plan change will be removed.`)||token!==epoch||busy)return;
  await act({action:'cancel',subscriptionEnd:m.periodEnd},'Cancellation is scheduled. Your membership will not renew.');
};
byId('lrMemberKeep').onclick=async()=>{
  const m=state?.membership,token=epoch;if(!m||busy)return;
  if(!await confirmAction('Keep your membership?',`Your ${m.name} membership will renew at ${money(m.amount,m.currency)} per ${m.cycle==='yearly'?'year':'month'} starting ${date(m.periodEnd)}.`)||token!==epoch||busy)return;
  await act({action:'keep',subscriptionEnd:m.periodEnd},'Cancellation removed. Your membership will renew.');
};
byId('lrLegacyLink').onclick=async()=>{
  if(busy)return;const uid=byId('lrLegacyUid').value.trim(),subscriptionId=byId('lrLegacySub').value.trim(),token=epoch;
  if(!uid||!subscriptionId){feedback('Enter both identifiers.',true);return;}
  if(!await confirmAction('Connect this existing member?',`Connect Stripe subscription ${subscriptionId} to website account ${uid}. Confirm you checked both records and they belong to the same person.`)||token!==epoch||busy)return;
  await act({action:'linkLegacy',uid,subscriptionId},'Existing membership connected. The member can now refresh their status.');
};
ctas.forEach(btn=>btn.addEventListener('click',()=>choose(btn.dataset.tier+'_'+(byId('toggle')?.classList.contains('yearly')?'yearly':'monthly'))));
onAuthStateChanged(auth,()=>{feedback('');dialog.open&&dialog.close();refresh();});
// Checkout redirects are not proof of payment: always read server-side status.
if(new URLSearchParams(location.search).get('checkout')==='success')feedback('Checkout finished. Checking your membership with Stripe…');

function renderTestAudit(){
  const element=document.getElementById('lrTestAudit');
  if(!element)return;
  const audit=state?.testAudit;
  element.textContent=!audit ? 'Sign in as the administrator to run this sandbox.' :
    state.membership?.hasAccess ? (audit.tier ? 'Webhook verified: test membership access is active.' : 'Waiting for the signed Stripe test webhook. Refresh status shortly.') :
    (audit.tier ? 'Subscription ended. Waiting for the signed webhook to remove test access.' : 'No active test membership access.');
  const results=document.getElementById('lrTestResults');
  results?.replaceChildren();
  for(const check of state?.lifecycle?.checks||[]){const li=document.createElement('li');li.textContent='PASS: '+check;results?.append(li);}
}
const testBanner=document.createElement('section');
testBanner.className='lr-member';
testBanner.innerHTML='<h2>STRIPE TEST MODE · Administrator only</h2><p>This page uses sandbox subscriptions and separate test access claims. Use only Stripe test payment details.</p><p id="lrTestAudit" role="status"></p><ol id="lrTestResults"></ol><div class="lr-member-actions"><button type="button" id="lrTestRun">Run lifecycle checks</button><button type="button" id="lrTestEnd" class="secondary">End test subscription now</button></div><p>After test checkout, run lifecycle checks. Then end the test subscription and refresh status to verify webhook access removal. Ending it immediately verifies the deletion event; it does not simulate time passing to renewal.</p>';
host.append(testBanner);
renderTestAudit();
byId('lrTestRun').onclick=async()=>{
  if(busy)return;
  if(!await confirmAction('Run sandbox lifecycle checks?','This changes and cancels only the connected Stripe TEST subscription, verifies Keep Membership, and leaves it scheduled to cancel. No live payment is made.'))return;
  await act({action:'testLifecycle'},'Sandbox lifecycle checks passed. See the result list below.');
};
byId('lrTestEnd').onclick=async()=>{
  if(busy)return;
  if(!await confirmAction('End the test subscription now?','This ends only the connected Stripe TEST subscription so we can verify that its signed webhook removes test access.'))return;
  await act({action:'testEndNow'},'Test subscription ended. Refresh status shortly to verify webhook access removal.');
};

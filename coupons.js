/* Add these exports to your EXISTING functions/index.js with:
   Object.assign(exports, require('./coupons'));
   Do NOT overwrite your existing index.js or existing functions. */
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('node:crypto');
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const ADMIN_UID = process.env.LR_ADMIN_UID;
const region = 'us-central1';
function mustSignIn(req) {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to your Library Reeds account.');
  return req.auth.uid;
}
function mustAdmin(req) {
  const uid = mustSignIn(req);
  if (!ADMIN_UID || uid !== ADMIN_UID) throw new HttpsError('permission-denied', 'Administrator only.');
  return uid;
}
function str(x, max=120) {return typeof x === 'string' ? x.trim().slice(0,max) : '';}
function token() { return crypto.randomBytes(18).toString('base64url'); }
function validateCode(x) {
  const code=str(x,120);
  if (!/^[A-Za-z0-9_-]{24}$/.test(code)) throw new HttpsError('invalid-argument','Invalid coupon code.');
  return code;
}
function display(d) { return {id:d.id,title:d.title,percentOff:d.percentOff,expiresAt:d.expiresAt || null,status:d.status,redeemedAt:d.redeemedAt || null}; }

/** Define sale offers; these are NOT purchased coupons. */
exports.lrSaveCouponOffer = onCall({region, enforceAppCheck:false}, async req => {
  mustAdmin(req);
  const title = str(req.data?.title,100);
  const percentOff=Number(req.data?.percentOff);
  const priceCents=Number(req.data?.priceCents);
  const expiresAt = req.data?.expiresAt ? str(req.data.expiresAt,10) : null;
  if (!title || !Number.isInteger(percentOff) || percentOff<1 || percentOff>100 || !Number.isInteger(priceCents) || priceCents<0 || (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt))) throw new HttpsError('invalid-argument','Invalid offer fields.');
  const ref=db.collection('lr_coupon_offers').doc();
  await ref.set({title,percentOff,priceCents,expiresAt,active:true,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  return {offerId:ref.id};
});

/** ONLY an admin can issue, and ONLY against a trusted server-verified order.
 * Your payment webhook must set orders/{orderId}.paymentVerified=true and paid=true on the server,
 * with buyerUid and couponOfferId. Never allow customers to set these fields. */
exports.lrIssuePaidCoupon = onCall({region, enforceAppCheck:false}, async req => {
  mustAdmin(req);
  const orderId=str(req.data?.orderId,128);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) throw new HttpsError('invalid-argument','Invalid order ID');
  const orderRef=db.collection('orders').doc(orderId);
  const issuedRef=db.collection('lr_issued_coupons').doc(orderId); // one coupon per order, idempotent
  return db.runTransaction(async tx => {
    const [orderSnap, prior] = await Promise.all([tx.get(orderRef),tx.get(issuedRef)]);
    if (prior.exists) return {couponId:issuedRef.id,alreadyIssued:true};
    if (!orderSnap.exists) throw new HttpsError('not-found','Order not found');
    const order=orderSnap.data();
    if (order.paymentVerified !== true || order.paid !== true || !order.buyerUid || !order.couponOfferId) throw new HttpsError('failed-precondition','Order requires trusted payment verification, buyerUid and couponOfferId');
    const offerRef=db.collection('lr_coupon_offers').doc(order.couponOfferId);
    const offerSnap=await tx.get(offerRef);
    if (!offerSnap.exists || offerSnap.data().active !== true) throw new HttpsError('failed-precondition','Coupon offer unavailable');
    const offer=offerSnap.data();
    const code=token();
    tx.create(issuedRef,{code,title:offer.title,percentOff:offer.percentOff,expiresAt:offer.expiresAt||null,ownerUid:order.buyerUid,sourceOrderId:orderId,status:'active',issuedAt:admin.firestore.FieldValue.serverTimestamp()});
    return {couponId:issuedRef.id,alreadyIssued:false};
  });
});

/** Customer sees only their own coupons. No public Firestore access needed. */
exports.lrMyCoupons = onCall({region, enforceAppCheck:false}, async req => {
  const uid=mustSignIn(req);
  const snap=await db.collection('lr_issued_coupons').where('ownerUid','==',uid).limit(100).get();
  return {coupons:snap.docs.map(s=>({...display({id:s.id,...s.data()}),code:s.data().code}))};
});

/** Read-only scan/verify. Scanning itself never consumes a coupon. */
exports.lrCheckCoupon = onCall({region, enforceAppCheck:false}, async req => {
  const uid=mustSignIn(req);
  const code=validateCode(req.data?.code);
  const snap=await db.collection('lr_issued_coupons').where('code','==',code).limit(1).get();
  const coupon=snap.docs[0];
  if (!coupon || coupon.data().ownerUid!==uid) throw new HttpsError('permission-denied','Coupon not found in your account');
  const c=coupon.data();
  const expired=c.expiresAt && c.expiresAt < new Date().toISOString().slice(0,10);
  return {coupon:display({id:coupon.id,...c}),valid:c.status==='active'&&!expired};
});

/** One-time voucher consumption. This does NOT apply a price discount to a cart.
 * Integrate the same transaction into YOUR trusted checkout order-calculation/payment flow
 * BEFORE describing these vouchers as checkout discounts. */
exports.lrRedeemCoupon = onCall({region, enforceAppCheck:false}, async req => {
  const uid=mustSignIn(req);
  const code=validateCode(req.data?.code);
  const found=await db.collection('lr_issued_coupons').where('code','==',code).limit(1).get();
  const coupon=found.docs[0];
  if (!coupon) throw new HttpsError('not-found','Coupon not found');
  return db.runTransaction(async tx => {
    const fresh=await tx.get(coupon.ref);
    const data=fresh.data();
    if (!data || data.ownerUid!==uid) throw new HttpsError('permission-denied','This coupon belongs to another account');
    if (data.status!=='active') throw new HttpsError('failed-precondition','Coupon already redeemed');
    if (data.expiresAt && data.expiresAt < new Date().toISOString().slice(0,10)) throw new HttpsError('failed-precondition','Coupon expired');
    tx.update(coupon.ref,{status:'redeemed',redeemedAt:admin.firestore.FieldValue.serverTimestamp(),redeemedBy:uid});
    return {redeemed:true,percentOff:data.percentOff,description:data.title};
  });
});

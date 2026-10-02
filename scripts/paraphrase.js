#!/usr/bin/env node
'use strict';
/**
 * paraphrase.js — the same intent said many ways. Guards against rules tuned to one exam sentence.
 *   node scripts/paraphrase.js [--verbose]
 * Each group lists the intents that count as right (a phrasing can honestly land on either) and the wordings,
 * including typos, Hinglish and script. Pass mark 100%: a wording that misroutes is a bug or a new wording to learn.
 */
const path = require('path'); const os = require('os'); const fs = require('fs');
const { Brain } = require('../core/brain');
const verbose = process.argv.includes('--verbose');
const GROUPS = [
  { ok: ['price', 'enquiry'], texts: ['goa price?', 'kitna hai goa ka', 'what is the cost for goa', 'goa ka rate batao', 'how much for manali', 'manali charges?', 'rate kya hai goa', 'price list bhejo', 'ગોવા કેટલા?', 'गोवा कितने का है', 'goa cost per person', 'goa me kitna lagega'] },
  { ok: ['book'], texts: ['ok hold', 'book karo', 'hold 2 seats', 'yes please book', 'haan hold kar do', 'reserve 3', 'block my seat', 'ok book it', 'confirm my booking', 'hold kar do bhai', 'ઓકે બુક કરો', 'हाँ होल्ड करो'] },
  { ok: ['faq:cancellation', 'refund:calc', 'cancel:company'], texts: ['what if we cancel', 'cancellation policy?', 'cancel karna pade to?', 'refund rules', 'agar plan cancel ho gaya to paise?', 'can i cancel later', 'what is your refund policy', 'cancel krna ho to kya hoga', 'રદ કરીએ તો?', 'कैंसिल किया तो रिफंड?'] },
  { ok: ['faq:safety'], texts: ['is it safe for girls', 'solo girl safe?', 'ladkiyon ke liye safe hai', 'women safety?', 'i am travelling alone, safe?', 'akeli ladki ja sakti hai?', 'security kaisi hai', 'safe for a single woman', 'छोकरियों के लिए सेफ है?', 'is the trip safe'] },
  { ok: ['faq:food', 'faq:included'], texts: ['veg food?', 'khana veg milega?', 'jain food available?', 'what about meals', 'non veg hai?', 'food kaisa hoga', 'શાકાહારી જમવાનું?', 'खाना शाकाहारी?', 'is jain food there', 'meals included?'] },
  { ok: ['faq:pickup'], texts: ['pickup point?', 'kahan se nikloge', 'where does the bus leave from', 'pickup kahan hai', 'starting point', 'bus kitne baje nikalti hai', 'from where do we start', 'पिकअप कहाँ से?', 'પિકઅપ ક્યાંથી?', 'departure point and time'] },
  { ok: ['faq:payment', 'book'], texts: ['how to pay', 'payment kaise karna hai', 'upi id bhejo', 'bank details?', 'can i pay by card', 'advance kitna hai', 'pay kaise karu', 'send account number', 'भुगतान कैसे करें', 'ચુકવણી કેવી રીતે?'] },
  { ok: ['objection:price'], texts: ['too expensive', 'bahut mehenga hai', 'discount milega?', 'any discount', 'kuch kam karo', 'costly hai yaar', 'can you reduce the price', 'thoda kam nahi ho sakta', 'મોંઘું છે', 'महंगा है, डिस्काउंट?'] },
  { ok: ['faq:included', 'faq:hidden'], texts: ['what is included', 'kya kya included hai', 'any hidden charges', 'price me kya aata hai', 'is hotel included', 'sab included hai?', 'hidden cost to nahi?', 'what does the price cover', 'કિંમત માં શું સમાવેશ છે?', 'किंमत में क्या शामिल है'] },
  { ok: ['human'], texts: ['i want to talk to a human', 'call me', 'kisi se baat karni hai', 'give me your number', 'can i speak to someone', 'koi insaan hai?', 'talk to a person please', 'number do', 'मुझे किसी से बात करनी है', 'can someone call me'] },
  { ok: ['incident'], texts: ['bus broke down we are stuck', 'accident ho gaya hai', 'we are stranded near surat', 'hum phas gaye hain', 'driver is drunk', 'bus band pad gayi', 'one person injured', 'hotel is dirty right now', 'our bus has broken down', 'stuck on the highway'] },
  { ok: ['faq:kids'], texts: ['kids price?', 'bachcho ka kitna', 'is there a child rate', 'children free hai?', 'kids ka charge', 'baccha 4 saal ka free?', 'price for a 7 year old', 'kids half price?', 'बच्चों का रेट', 'બાળકો માટે કિંમત?'] },
  { ok: ['faq:weather'], texts: ['how cold will it be', 'kitni thand hogi', 'snow milega?', 'what to pack', 'jacket chahiye?', 'temperature kaisa rahega', 'is it very cold in december', 'thermals lene padenge?', 'बर्फ मिलेगी?', 'ઠંડી કેટલી હશે?'] },
  { ok: ['faq:age'], texts: ['parents allowed?', 'my mother is 65, ok?', 'senior citizens aa sakte hain?', 'is it ok for elderly', 'buzurg ke liye theek hai?', 'kids allowed', 'can my dad come, he is 70', 'वरिष्ठ नागरिक ठीक रहेंगे?', 'is this trip fine for parents'] },
  { ok: ['faq:visa'], texts: ['do we need a visa for thailand', 'visa lagega kya', 'dubai visa kitne din me aata hai', 'passport chahiye?', 'which documents to carry', 'is thailand visa free for indians', 'ladakh permit lagta hai?', 'e-visa kaise apply kare', 'my passport expires in 4 months, ok?', 'documents list bhejo', 'वीज़ा लगेगा क्या', 'ILP needed for tawang?'] },
  { ok: ['escalate'], texts: ['third time asking, nobody replies', 'this is fraud', 'i will complain to consumer court', 'worst service ever', 'nobody is responding to me', 'is this how you treat customers', 'i want to speak to the owner now, this is unacceptable', 'ignoring me since morning', 'you people never reply'] },
];
async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oye-para-'));
  const b = new Brain({ dataDir: dir, autosave: false }); b.evolution.genome.curiosity = 0; b.studyCurriculum(path.join(__dirname, '..', 'curriculum'));
  b.growth.setProfile({ city: 'Ahmedabad', phone: '9876543210', upi: 'tc@upi', trips: [{ name: 'Goa', date: '2099-12-12', days: 4, price: 14500, seats: 16, booked: 9 }, { name: 'Manali', date: '2099-12-20', days: 5, price: 12500, seats: 20, booked: 3 }] });
  let total = 0, pass = 0; const fails = [];
  for (const G of GROUPS) for (const text of G.texts) { total++; const got = b.growth.intent(text).intent; if (G.ok.includes(got)) pass++; else fails.push({ text, got, want: G.ok.join('|') }); }
  for (const f of fails) console.log(`   ✗ "${f.text}" → ${f.got} (want ${f.want})`);
  console.log(`Paraphrases: ${pass}/${total} routed right (${Math.round(100 * pass / total)}%) ${pass === total ? 'PASS' : 'FAIL'}`);
  fs.writeFileSync(path.join(__dirname, '..', 'synth', 'paraphrase.json'), JSON.stringify({ at: new Date().toISOString(), pass, total, fails }, null, 1));
  process.exitCode = pass === total ? 0 : 2;
}
run();

'use strict';
/**
 * scripts/whatsapp.js — connect the clan's real WhatsApp Business number to the ATLAS growth agent, for free.
 *
 * Runs on your own PC (or the server) next to the site. It links as a "Linked device" of WhatsApp Business using the
 * open-source Baileys library, forwards every incoming customer message to ATLAS, and either sends ATLAS's reply
 * (when "Auto-send" is on in the Grow tab) or just logs the draft for you to send by hand.
 *
 *   npm install @whiskeysockets/baileys qrcode-terminal
 *   ATLAS_URL=http://localhost:3000 node scripts/whatsapp.js        (or http://localhost:PORT/admin/atlas when mounted in the site)
 *
 * Scan the QR with WhatsApp Business → Linked devices. Session is saved in data/wa-auth so you scan once.
 * Booking/payment/complaint messages are never auto-answered: ATLAS flags them and you reply yourself.
 */
const path = require('path');
const fs = require('fs');
const ATLAS_URL = (process.env.ATLAS_URL || 'http://localhost:3000').replace(/\/$/, '');
const AUTH_DIR = process.env.WA_AUTH || path.join(__dirname, '..', 'data', 'wa-auth');

let baileys;
try { baileys = require('@whiskeysockets/baileys'); } catch (e) { console.error('Install first:  npm install @whiskeysockets/baileys qrcode-terminal'); process.exit(1); }
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

async function atlas(method, url, body) {
  const r = await fetch(ATLAS_URL + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

async function start() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const sock = makeWASocket({ auth: state, version, printQRInTerminal: false, browser: ['ATLAS', 'Chrome', '1.0'] });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => {
    if (u.qr) { try { require('qrcode-terminal').generate(u.qr, { small: true }); } catch { console.log('QR:', u.qr); } console.log('Scan with WhatsApp Business → Linked devices.'); }
    if (u.connection === 'open') { console.log('Connected. ATLAS at', ATLAS_URL); startDigest(sock); }
    if (u.connection === 'close') { const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode; if (code !== DisconnectReason.loggedOut) { console.log('Reconnecting…'); start(); } else console.log('Logged out. Delete', AUTH_DIR, 'and scan again.'); }
  });
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      const jid = m.key.remoteJid || ''; if (jid.endsWith('@g.us') || jid === 'status@broadcast') continue; // ignore groups and statuses
      const text = m.message.conversation || (m.message.extendedTextMessage && m.message.extendedTextMessage.text) || '';
      if (!text) continue;
      const id = jid.replace(/@.*/, ''); const name = m.pushName || '';
      try {
        const r = await atlas('POST', '/api/growth/chat', { id, name, text, source: 'whatsapp' });
        console.log(`[${new Date().toLocaleTimeString()}] ${name || id}: ${text}\n   → ${r.reply}${r.handoff ? '   ⚠ HUMAN NEEDED' : ''}${r.send ? '   (sent)' : '   (draft, not sent)'}`);
        if (r.send && r.reply) { await sock.sendPresenceUpdate('composing', jid); await new Promise(res => setTimeout(res, 1500 + Math.min(4000, r.reply.length * 20))); await sock.sendMessage(jid, { text: r.reply }); }
      } catch (e) { console.error('ATLAS unreachable:', e.message); }
    }
  });
}
/** 9:00 IST every day: the day's work, sent to this number itself (or WA_DIGEST_TO=91XXXXXXXXXX). */
let digestTimer = null, lastDigestDay = '';
function startDigest(sock) {
  if (digestTimer) return;
  digestTimer = setInterval(async () => {
    const ist = new Date(Date.now() + 5.5 * 3600e3); const day = ist.toISOString().slice(0, 10);
    if (ist.getUTCHours() !== 9 || lastDigestDay === day) return;
    lastDigestDay = day;
    try {
      const d = await atlas('GET', '/api/growth/digest');
      const to = (process.env.WA_DIGEST_TO || (sock.user && sock.user.id || '').replace(/:.*@/, '@').replace(/@.*/, '')).replace(/\D/g, '');
      if (to && d.text) { await sock.sendMessage(to + '@s.whatsapp.net', { text: d.text }); console.log('Digest sent to', to); }
    } catch (e) { console.error('digest failed:', e.message); }
  }, 60e3);
}
start();

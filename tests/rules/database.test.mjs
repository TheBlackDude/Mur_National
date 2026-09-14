import { test, before, after, beforeEach } from 'node:test'
import { ref, get, set, remove, update } from 'firebase/database'
import { env, who, ok, denied } from './env.mjs'

let t, u
const rt = (c) => c.database()
before(async () => { t = await env(); u = who(t) })
after(async () => { await t.cleanup() })
beforeEach(async () => {
  await t.clearDatabase()
  await t.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), '/'), {
      counters: { national: 12, prefectures: { 'CKY-KAL': 3 }, countries: { FR: 2 } },
      seq: { participant: 12 },
      rate: { 'citizen-1': { selfie: { 497000: 2 } } },
      locks: { 'item-1': { uid: 'mod-1', at: 1 } },
      stats: { hourly: { 2026092510: 4 } },
      alerts: { backlog: 1 },
    })
  })
})

test('counters: readable by the world, written by the functions only', async () => {
  await ok(get(ref(rt(u.anon), 'counters/national')))
  await ok(get(ref(rt(u.anon), 'counters/prefectures')))
  await denied(set(ref(rt(u.anon), 'counters/national'), 999))
  await denied(set(ref(rt(u.admin), 'counters/national'), 999))
  await denied(update(ref(rt(u.editor), 'counters'), { national: 999 }))
})

test('seq, rate, alerts: closed to every client, even admins', async () => {
  for (const p of ['seq/participant', 'rate/citizen-1', 'alerts']) {
    await denied(get(ref(rt(u.anon), p)))
    await denied(get(ref(rt(u.admin), p)))
    await denied(set(ref(rt(u.admin), p), 1))
  }
})

test('locks: moderators and editors hold and release them, with uid and at', async () => {
  await ok(get(ref(rt(u.moderator), 'locks/item-1')))
  await denied(get(ref(rt(u.anon), 'locks/item-1')))
  await denied(get(ref(rt(u.citizen), 'locks/item-1')))
  await denied(get(ref(rt(u.maeiage), 'locks/item-1')))
  await ok(set(ref(rt(u.moderator), 'locks/item-2'), { uid: 'mod-1', at: Date.now() }))
  await ok(set(ref(rt(u.editor), 'locks/item-3'), { uid: 'ed-1', at: Date.now() }))
  await ok(set(ref(rt(u.admin), 'locks/item-4'), { uid: 'adm-1', at: Date.now() }))
  await denied(set(ref(rt(u.moderator), 'locks/item-5'), { uid: 'mod-1' }))          // missing `at`
  await denied(set(ref(rt(u.moderator), 'locks/item-5'), 'mine'))                    // not an object
  await denied(set(ref(rt(u.citizen), 'locks/item-6'), { uid: 'citizen-1', at: 1 }))
  await ok(remove(ref(rt(u.moderator), 'locks/item-1')))
})

test('stats: dashboard readers only, no client writes', async () => {
  await ok(get(ref(rt(u.moderator), 'stats/hourly')))
  await ok(get(ref(rt(u.maeiage), 'stats/hourly')))
  await denied(get(ref(rt(u.anon), 'stats/hourly')))
  await denied(get(ref(rt(u.citizen), 'stats/hourly')))
  await denied(set(ref(rt(u.admin), 'stats/hourly/2026092511'), 1))
})

test('root and unknown paths are closed', async () => {
  await denied(get(ref(rt(u.admin), '/')))
  await denied(set(ref(rt(u.admin), 'anything'), 1))
})

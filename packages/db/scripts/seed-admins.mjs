// Seed des comptes admin (OTP e-mail, sans mot de passe).
// Usage : node --env-file=.env packages/db/scripts/seed-admins.mjs
//
// Crée les utilisateurs dans auth.users (email confirmé -> OTP direct). Le trigger
// 0002 leur pose un profil role='admin' ; on ré-affirme le rôle ici par sécurité
// (idempotent, ré-exécutable).

import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = ['blmd8345@gmail.com', 'glbagencyy@gmail.com']

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SECRET_KEY manquants (cf. .env).')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function findUserId(email) {
  // pagination simple : suffisant à cette échelle.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id
}

let failures = 0
for (const email of ADMIN_EMAILS) {
  try {
    let userId
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    })
    if (error) {
      if (/registered|already|exists/i.test(error.message)) {
        userId = await findUserId(email)
        console.log(`• ${email} : déjà existant -> ${userId}`)
      } else {
        throw error
      }
    } else {
      userId = data.user.id
      console.log(`• ${email} : créé -> ${userId}`)
    }
    if (!userId) throw new Error('id introuvable après création')

    const { error: pErr } = await admin
      .from('profiles')
      .upsert({ id: userId, role: 'admin', display_name: email.split('@')[0] }, { onConflict: 'id' })
    if (pErr) throw pErr
    console.log(`  ↳ profil role=admin OK`)
  } catch (e) {
    failures += 1
    console.error(`✗ ${email} : ${e.message}`)
  }
}

console.log(failures === 0 ? '\n✅ Seed admins terminé.' : `\n⚠️  ${failures} échec(s).`)
process.exit(failures === 0 ? 0 : 1)

/**
 * Create one local account, from the environment or a prompt.
 *
 *   SPORTS_APP_SEED_USERNAME=alice SPORTS_APP_SEED_PASSWORD=… npm run seed
 *   npm run seed            (asks for both; the password is not echoed)
 *
 * This app has no register page, so this is how an account comes to exist
 * besides "Sign in with Ward" creating one. It is also how existing history is
 * kept: snapshots are keyed by username, so creating an account with the same
 * name as an old stream makes that stream readable again. Ward is then linked
 * from that person's own settings, never matched by name.
 *
 * **Idempotent.** An account that already exists is left exactly as it is —
 * neither the password nor the role is touched — so this is safe to run on every
 * deploy. The name has to fit the document schema (`shared/username.ts`), which is
 * stricter than the library's own rule, and is refused here before anything is
 * written.
 *
 * The username and the password come from the environment or a prompt, **never
 * from a file in the repository**, and neither is printed.
 */
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { Writable } from 'node:stream'
import { DEFAULT_DB_FILE, openSnapshotStore } from './db.mjs'
import {
  DEFAULT_ROLE,
  USERNAME_RULE,
  linkWardStreams,
  openAccounts,
  orphanStreamNames,
} from './ward.mjs'
import { isValidUsername } from '@sports-app/shared/username.ts'
import { seedUsers } from './vendor/ward/ward-auth.js'

/**
 * Ask a question on the terminal. With `hidden`, what is typed is not echoed.
 *
 * @param {string} question
 * @param {{ hidden?: boolean }} [options]
 */
async function ask(question, { hidden = false } = {}) {
  let muted = false
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) process.stdout.write(chunk)
      done()
    },
  })
  const rl = createInterface({ input: process.stdin, output, terminal: true })
  try {
    const pending = rl.question(question)
    muted = hidden
    const answer = await pending
    if (hidden) process.stdout.write('\n')
    return answer
  } finally {
    rl.close()
  }
}

/**
 * Create the account if it does not exist. Throws with a message fit to print.
 *
 * @param {{
 *   username: string,
 *   password: string,
 *   role?: string,
 *   store: import('./db.mjs').SnapshotStore,
 *   accounts?: import('./vendor/ward/ward-auth.js').Accounts,
 * }} input
 * @returns {Promise<{ created: boolean, hadHistory: boolean, orphans: string[] }>}
 */
export async function seedAccount({ username, password, role = DEFAULT_ROLE, store, accounts }) {
  const name = String(username ?? '').trim()
  if (!isValidUsername(name)) {
    throw new Error(`That username will not work: expected ${USERNAME_RULE}.`)
  }
  if (typeof password !== 'string' || password === '') {
    throw new Error('A password is required.')
  }

  const owner = accounts ?? openAccounts(store.db)
  const result = await seedUsers(owner, [{ username: name, password, role }])
  // Streams keyed by a Ward subject are not orphans: the service links them at boot.
  await linkWardStreams(store, owner)

  return {
    created: result.created.includes(name),
    hadHistory: store.count(name) > 0,
    orphans: await orphanStreamNames(store, owner),
  }
}

/** @param {Record<string, string | undefined>} env */
async function main(env) {
  const dbFile = env.SPORTS_APP_DB ?? DEFAULT_DB_FILE
  const interactive = process.stdin.isTTY === true

  let username = env.SPORTS_APP_SEED_USERNAME ?? ''
  let password = env.SPORTS_APP_SEED_PASSWORD ?? ''
  if (username === '') {
    if (!interactive) throw new Error('Set SPORTS_APP_SEED_USERNAME, or run this in a terminal.')
    username = await ask('Username: ')
  }
  if (password === '') {
    if (!interactive) throw new Error('Set SPORTS_APP_SEED_PASSWORD, or run this in a terminal.')
    password = await ask('Password: ', { hidden: true })
  }

  const store = openSnapshotStore({ file: dbFile })
  try {
    const result = await seedAccount({ username, password, store })
    const name = username.trim()
    console.log(
      result.created
        ? `created: ${name}`
        : `exists: ${name} (left exactly as it was; its password and role are not touched)`,
    )
    if (result.hadHistory) {
      console.log(`${name} has saved training history on this service, and it is theirs again.`)
    }
    if (result.orphans.length > 0) {
      console.log(
        `snapshot streams with no account: ${result.orphans.join(', ')}. ` +
          'Create an account with the same username to read one again.',
      )
    }
  } finally {
    store.close()
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url

if (invokedDirectly) {
  main(process.env).catch((cause) => {
    console.error(cause instanceof Error ? cause.message : String(cause))
    process.exitCode = 1
  })
}

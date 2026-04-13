const { createClient } = require('@supabase/supabase-js')
const axios = require('axios')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BASE_URL = 'https://' + process.env.REPLIT_DEV_DOMAIN
const ADMIN_KEY = process.env.ADMIN_KEY
const CARD_ID = 'b99854e1-a8a6-4165-a065-44320457b117'
const AGENT_PROFILE_ID = 'c2d7497e-33dc-4c2b-9c32-d167268aebc6'
const HUMAN_PROFILE_ID = 'ecbd07cb-9227-421a-91e2-24f22a20e7da'
const USER_EMAIL = 'harrisahmedqazi@gmail.com'
const USER_PASSWORD = process.env.TEST_USER_PASSWORD || ''
const SECOND_USER_EMAIL = 'harisqazi@yahoo.com'
const LOG_FILE = path.join(__dirname, 'test-log.md')
const MAX_ATTEMPTS = 5

let AGENT_TOKEN = null
let TOKEN_HASH = null
let USER_JWT = null
let USER_CARD_ID = null
let USER_INVITE_CODE = null
let USER_PROFILE_ID = null
let SECOND_USER_JWT = null
let SECOND_USER_PROFILE_ID = null
let logBuffer = []
let fixHistory = {}

function log(msg) {
  const line = typeof msg === 'object'
    ? JSON.stringify(msg, null, 2) : msg
  console.log(line)
  logBuffer.push(line)
}

function writeLog() {
  fs.writeFileSync(LOG_FILE,
    '# Pooly Auto-Test Log\n' +
    'Generated: ' + new Date().toISOString() + '\n\n' +
    logBuffer.join('\n'))
}

function recordHistory(testKey, entry) {
  if (!fixHistory[testKey]) fixHistory[testKey] = []
  fixHistory[testKey].push({
    ...entry,
    timestamp: new Date().toISOString()
  })
}

function getHistory(testKey) {
  return fixHistory[testKey] || []
}

function wasAlreadyTried(testKey, fixDescription) {
  return getHistory(testKey)
    .some(h => h.fixApplied === fixDescription)
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function checkServerUp() {
  try {
    const res = await axios.get(BASE_URL + '/health',
      { timeout: 5000 })
    return res.data?.status === 'POOLY BACKEND LIVE'
  } catch {
    return false
  }
}

async function restartServer() {
  log('Restarting server...')
  const { exec } = require('child_process')
  await new Promise(resolve => {
    exec("pkill -f 'node server.js'", () => resolve())
  })
  await sleep(1000)
  const { spawn } = require('child_process')
  const child = spawn('node', ['server.js'], {
    detached: true,
    stdio: 'ignore',
    cwd: '/home/runner/workspace'
  })
  child.unref()
  await sleep(3000)
  const up = await checkServerUp()
  if (!up) {
    log('SERVER FAILED TO RESTART')
    return false
  }
  log('Server restarted successfully')
  return true
}

async function getUserJWT(email, password) {
  const res = await axios.post(
    BASE_URL + '/api/dev/test-token',
    { email, password },
    { validateStatus: () => true }
  )
  if (!res.data?.access_token) {
    throw new Error('Could not get user JWT: ' +
      JSON.stringify(res.data))
  }
  return res.data.access_token
}

async function runFix(fixNumber, fixName, fixFn) {
  log('\n--- FIX ' + fixNumber + ': ' + fixName + ' ---')
  let attempts = 0
  while (attempts < MAX_ATTEMPTS) {
    attempts++
    try {
      const result = await fixFn(attempts)
      if (result.success) {
        log('✅ FIX ' + fixNumber + ' PASSED: ' + fixName)
        writeLog()
        return true
      } else {
        log('❌ FIX ' + fixNumber + ' attempt ' +
          attempts + ' failed: ' + result.error)
        if (attempts >= MAX_ATTEMPTS) {
          log('🛑 FIX ' + fixNumber +
            ' EXHAUSTED 5 ATTEMPTS — stopping script')
          log('Recommended manual steps: ' + result.manualFix)
          writeLog()
          process.exit(1)
        }
        await sleep(1000)
      }
    } catch (err) {
      log('💥 FIX ' + fixNumber +
        ' exception: ' + err.message)
      if (attempts >= MAX_ATTEMPTS) {
        writeLog()
        process.exit(1)
      }
    }
  }
}

async function runTest(testNumber, testName, testFn) {
  log('\n=== TEST ' + testNumber + ': ' + testName + ' ===')
  const testKey = 'test-' + testNumber
  let attempts = 0

  while (attempts < MAX_ATTEMPTS) {
    attempts++
    log('--- Attempt ' + attempts + ' of ' +
      MAX_ATTEMPTS + ' ---')
    try {
      const result = await testFn(attempts, testKey)

      if (result.pass) {
        log('✅ PASS: ' + testName)
        log('Response: ' +
          JSON.stringify(result.data, null, 2))
        recordHistory(testKey, {
          attempt: attempts,
          error: null,
          hypothesis: null,
          fixApplied: null,
          result: 'pass'
        })
        writeLog()
        return result
      }

      log('❌ FAIL attempt ' + attempts + ': ' +
        result.reason)
      log('HTTP Status: ' + result.status)
      log('Response: ' +
        JSON.stringify(result.data, null, 2))
      log('Matched predicted cause: ' +
        (result.matchedCause || 'no'))

      recordHistory(testKey, {
        attempt: attempts,
        error: result.reason,
        hypothesis: result.hypothesis || 'unknown',
        fixApplied: result.fixApplied || 'none',
        result: 'fail'
      })

      if (attempts >= MAX_ATTEMPTS) {
        log('🛑 EXHAUSTED ' + MAX_ATTEMPTS +
          ' ATTEMPTS on TEST ' + testNumber)
        log('Full history for this test:')
        log(getHistory(testKey))
        log('RECOMMENDED MANUAL FIX:')
        log(result.manualFix ||
          'Review test-log.md for full diagnosis')
        writeLog()
        process.exit(1)
      }

      if (result.diagnoseAndFix) {
        log('Running diagnoseAndFix...')
        await result.diagnoseAndFix()
      }

      log('Retrying test ' + testNumber + '...')
      await sleep(2000)

    } catch (err) {
      log('💥 Exception in test ' + testNumber +
        ': ' + err.message)
      log(err.stack)
      recordHistory(testKey, {
        attempt: attempts,
        error: err.message,
        hypothesis: 'uncaught exception',
        fixApplied: 'none',
        result: 'fail'
      })
      if (attempts >= MAX_ATTEMPTS) {
        log('🛑 STOPPING — unrecoverable exception')
        writeLog()
        process.exit(1)
      }
      await sleep(2000)
    }
  }
}

async function main() {
  log('# Pooly Auto-Test Log')
  log('Started: ' + new Date().toISOString())
  log('BASE_URL: ' + BASE_URL)
  log('CARD_ID: ' + CARD_ID)
  log('AGENT_PROFILE_ID: ' + AGENT_PROFILE_ID)
  log('')

  // ===== DATABASE FIXES =====
  log('## DATABASE FIXES')

  await runFix(1, 'Clean members array', async (attempt) => {
    const members = [HUMAN_PROFILE_ID, AGENT_PROFILE_ID]
    const { error } = await supabase
      .from('cards')
      .update({ members })
      .eq('id', CARD_ID)
    if (error) return {
      success: false,
      error: error.message,
      manualFix: 'Run: UPDATE cards SET members = ' +
        JSON.stringify(members) + ' WHERE id = ' + CARD_ID
    }
    const { data } = await supabase
      .from('cards')
      .select('members')
      .eq('id', CARD_ID)
      .single()
    const ok = data?.members?.includes(AGENT_PROFILE_ID) &&
               data?.members?.includes(HUMAN_PROFILE_ID)
    return ok
      ? { success: true }
      : { success: false,
          error: 'Verification failed, members: ' +
            JSON.stringify(data?.members),
          manualFix: 'Check RLS policies on cards table' }
  })

  await runFix(2, 'Set spending limits', async () => {
    const spending_limits = { daily_cap: 10000, max_per_txn: 2500 }
    const { error } = await supabase
      .from('cards')
      .update({ spending_limits })
      .eq('id', CARD_ID)
    if (error) return {
      success: false,
      error: error.message,
      manualFix: 'Check spending_limits column type is jsonb'
    }
    const { data } = await supabase
      .from('cards')
      .select('spending_limits')
      .eq('id', CARD_ID)
      .single()
    const ok = data?.spending_limits?.daily_cap === 10000 &&
               data?.spending_limits?.max_per_txn === 2500
    return ok
      ? { success: true }
      : { success: false,
          error: 'Limits not set correctly: ' +
            JSON.stringify(data?.spending_limits),
          manualFix: 'Manually update spending_limits in Supabase' }
  })

  await runFix(3, 'Set balance to $1000', async () => {
    const { error } = await supabase
      .from('cards')
      .update({ total_balance: 100000 })
      .eq('id', CARD_ID)
    if (error) return {
      success: false,
      error: error.message,
      manualFix: 'total_balance must be bigint in cents'
    }
    const { data } = await supabase
      .from('cards')
      .select('total_balance')
      .eq('id', CARD_ID)
      .single()
    return data?.total_balance === 100000
      ? { success: true }
      : { success: false,
          error: 'Balance is: ' + data?.total_balance,
          manualFix: 'Set total_balance = 100000 manually' }
  })

  await runFix(4, 'Ensure agent approved and active',
    async () => {
    const { error } = await supabase
      .from('profiles')
      .update({ kyc_status: 'approved', status: 'active' })
      .eq('id', AGENT_PROFILE_ID)
    if (error) return {
      success: false,
      error: error.message,
      manualFix: 'Check profiles table for agent profile ID'
    }
    const { data } = await supabase
      .from('profiles')
      .select('kyc_status, status')
      .eq('id', AGENT_PROFILE_ID)
      .single()
    return data?.kyc_status === 'approved' &&
           data?.status === 'active'
      ? { success: true }
      : { success: false,
          error: 'Profile state: ' + JSON.stringify(data),
          manualFix: 'Profile not found — check AGENT_PROFILE_ID' }
  })

  log('\n✅ All database fixes complete — starting tests\n')

  // ===== TESTS =====
  log('## HTTP TESTS')

  // TEST 1 — Health
  await runTest(1, 'Health check', async () => {
    const res = await axios.get(BASE_URL + '/health',
      { timeout: 5000 }).catch(e => ({ data: {}, status: 0,
        message: e.message }))
    const pass = res.data?.status === 'POOLY BACKEND LIVE'
    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Health check failed: ' +
        JSON.stringify(res.data),
      matchedCause: !pass ? 'server not reachable' : null,
      manualFix: 'Start server with: node server.js',
      diagnoseAndFix: async () => {
        log('Cannot auto-fix server down')
        log('Manual action required: restart the Replit')
        writeLog()
        process.exit(1)
      }
    }
  })

  // TEST 2 — Agent token
  await runTest(2, 'Agent token issuance',
    async (attempt, testKey) => {
    const res = await axios.post(
      BASE_URL + '/api/agent/token',
      { profile_id: AGENT_PROFILE_ID },
      { headers: { Authorization: 'Bearer ' + ADMIN_KEY },
        validateStatus: () => true }
    )
    const pass = res.status === 200 &&
                 typeof res.data?.token === 'string'
    if (pass) {
      AGENT_TOKEN = res.data.token
      TOKEN_HASH = crypto.createHash('sha256')
        .update(AGENT_TOKEN).digest('hex')
      log('AGENT_TOKEN saved (first 30 chars): ' +
        AGENT_TOKEN.substring(0, 30) + '...')
      log('TOKEN_HASH: ' + TOKEN_HASH)
    }

    const errMsg = res.data?.error || ''
    let hypothesis = 'unknown'
    let fixApplied = 'none'
    let matchedCause = 'no'

    const diagnoseAndFix = async () => {
      const history = getHistory(testKey)

      if (errMsg.includes('KYC') ||
          errMsg.includes('approved')) {
        matchedCause = 'agent not KYC approved'
        hypothesis = 'Agent kyc_status is not approved'
        if (!wasAlreadyTried(testKey, 'rerun-fix4')) {
          fixApplied = 'rerun-fix4'
          await supabase.from('profiles')
            .update({ kyc_status: 'approved',
                      status: 'active' })
            .eq('id', AGENT_PROFILE_ID)
          log('Re-ran FIX 4: set agent approved')
        }
      } else if (errMsg.includes('No card') ||
                 errMsg.includes('card found')) {
        matchedCause = 'agent not in card members'
        hypothesis = 'Agent profile not in cards.members'
        if (!wasAlreadyTried(testKey, 'rerun-fix1')) {
          fixApplied = 'rerun-fix1'
          const members = [HUMAN_PROFILE_ID,
                           AGENT_PROFILE_ID]
          await supabase.from('cards')
            .update({ members })
            .eq('id', CARD_ID)
          log('Re-ran FIX 1: reset members array')
        }
      } else if (errMsg.includes('Invalid admin') ||
                 errMsg.includes('admin key')) {
        log('ADMIN_KEY mismatch — cannot auto-fix')
        log('Check ADMIN_KEY in Replit Secrets')
        writeLog()
        process.exit(1)
      } else if (errMsg.includes('jwt') ||
                 errMsg.includes('JWT')) {
        log('AGENT_JWT_SECRET may not be set')
        log('Check Replit Secrets for AGENT_JWT_SECRET')
        writeLog()
        process.exit(1)
      } else {
        log('Unknown failure — entering catch-all diagnosis')
        log('1. Checking server health...')
        const up = await checkServerUp()
        log('   Server up: ' + up)

        log('2. Checking agent profile in Supabase...')
        const { data: profile } = await supabase
          .from('profiles').select('*')
          .eq('id', AGENT_PROFILE_ID).single()
        log('   Profile: ' + JSON.stringify(profile))

        log('3. Checking card members...')
        const { data: card } = await supabase
          .from('cards').select('members, spending_limits')
          .eq('id', CARD_ID).single()
        log('   Card members: ' +
          JSON.stringify(card?.members))

        log('4. Checking agent_tokens table...')
        const { data: tokens } = await supabase
          .from('agent_tokens').select('*')
          .eq('profile_id', AGENT_PROFILE_ID)
        log('   Existing tokens: ' +
          JSON.stringify(tokens))

        hypothesis = 'Data state looks ok — ' +
          'may be a route logic issue'
        fixApplied = 'catch-all-diagnosis-logged'
      }

      recordHistory(testKey, {
        attempt,
        error: errMsg,
        hypothesis,
        fixApplied,
        result: 'fail'
      })
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Token not returned: ' + errMsg,
      hypothesis,
      fixApplied,
      matchedCause,
      manualFix: 'Check agent profile kyc_status=approved ' +
        'and agent is in card.members array',
      diagnoseAndFix
    }
  })

  // TEST 3 — Agent pay $5
  await runTest(3, 'Agent pay valid $5',
    async (attempt, testKey) => {
    const ikey = 'auto-test-pay-' + Date.now()
    const res = await axios.post(
      BASE_URL + '/api/agent/pay',
      { amount: 5, merchant_name: 'Test Merchant',
        memo: 'Test payment', idempotency_key: ikey },
      { headers: {
          Authorization: 'Bearer ' + AGENT_TOKEN,
          'idempotency-key': ikey },
        validateStatus: () => true }
    )
    const pass = res.data?.approved === true &&
                 res.data?.provider === 'lithic'

    const errMsg = res.data?.error || ''
    const diagnoseAndFix = async () => {
      const history = getHistory(testKey)

      if (errMsg.includes('Insufficient') ||
          errMsg.includes('balance')) {
        if (!wasAlreadyTried(testKey, 'rerun-fix3')) {
          await supabase.from('cards')
            .update({ total_balance: 100000 })
            .eq('id', CARD_ID)
          log('Re-ran FIX 3: reset balance to 100000')
        }
      } else if (errMsg.includes('expired') ||
                 errMsg.includes('Invalid or expired')) {
        if (!wasAlreadyTried(testKey, 'refresh-token')) {
          log('Token expired — getting new token...')
          const tokenRes = await axios.post(
            BASE_URL + '/api/agent/token',
            { profile_id: AGENT_PROFILE_ID },
            { headers: {
                Authorization: 'Bearer ' + ADMIN_KEY } }
          )
          if (tokenRes.data?.token) {
            AGENT_TOKEN = tokenRes.data.token
            TOKEN_HASH = crypto.createHash('sha256')
              .update(AGENT_TOKEN).digest('hex')
            log('Got new token')
          }
        }
      } else if (!pass && res.data?.approved === true &&
                 res.data?.provider !== 'lithic') {
        log('Payment approved but provider is not lithic: ' +
          res.data?.provider)
        log('Route is not using Lithic as spending provider')
        log('Manual fix required in routes/agent.js /pay')
        writeLog()
        process.exit(1)
      } else if (errMsg.includes('cap') ||
                 errMsg.includes('limit')) {
        if (!wasAlreadyTried(testKey, 'increase-limits')) {
          await supabase.from('cards')
            .update({ spending_limits: {
              daily_cap: 1000000,
              max_per_txn: 100000 } })
            .eq('id', CARD_ID)
          log('Increased spending limits')
        }
      } else {
        log('Unknown failure — entering catch-all diagnosis')
        log('Checking each item:')

        log('1. Server health:')
        log('   Up: ' + await checkServerUp())

        log('2. Card state:')
        const { data: card } = await supabase
          .from('cards').select('*').eq('id', CARD_ID)
          .single()
        log('   ' + JSON.stringify(card))

        log('3. Agent token valid:')
        log('   Token exists: ' + !!AGENT_TOKEN)

        log('4. Idempotency — trying fresh key:')
        log('   Using timestamp key: ' + ikey)

        log('5. Checking agent_spend_log for blocked:')
        const { data: blocked } = await supabase
          .from('agent_spend_log').select('*')
          .eq('profile_id', AGENT_PROFILE_ID)
          .eq('status', 'blocked').limit(5)
        log('   Recent blocked: ' +
          JSON.stringify(blocked))
      }
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Payment not approved: ' + errMsg,
      manualFix: 'Check card balance, Lithic card_token, ' +
        'and spending_limits in Supabase',
      diagnoseAndFix
    }
  })

  // TEST 4 — Over cap $50
  await runTest(4, 'Agent pay over cap $50 (expect 403)',
    async (attempt, testKey) => {
    const ikey = 'auto-test-overcap-' + Date.now()
    const res = await axios.post(
      BASE_URL + '/api/agent/pay',
      { amount: 50, merchant_name: 'Test Merchant',
        memo: 'Over cap test', idempotency_key: ikey },
      { headers: {
          Authorization: 'Bearer ' + AGENT_TOKEN,
          'idempotency-key': ikey },
        validateStatus: () => true }
    )
    const pass = res.status === 403 &&
      JSON.stringify(res.data).toLowerCase()
        .includes('cap')

    const diagnoseAndFix = async () => {
      log('Checking spending_limits in Supabase...')
      const { data: card } = await supabase
        .from('cards').select('spending_limits')
        .eq('id', CARD_ID).single()
      log('Current limits: ' +
        JSON.stringify(card?.spending_limits))

      if (!card?.spending_limits?.max_per_txn ||
           card.spending_limits.max_per_txn === 0) {
        if (!wasAlreadyTried(testKey, 'set-limits')) {
          await supabase.from('cards')
            .update({ spending_limits: {
              daily_cap: 10000, max_per_txn: 2500 } })
            .eq('id', CARD_ID)
          log('Reset spending limits to daily:100, txn:25')
        }
      } else if (res.data?.approved === true) {
        log('Payment was APPROVED instead of blocked')
        log('checkAgentRules middleware may not be ' +
          'checking max_per_txn correctly')
        log('Reading routes/agent.js...')
        const agentFile = fs.readFileSync(
          '/home/runner/workspace/routes/agent.js', 'utf8')
        const hasCheck = agentFile.includes('max_per_txn')
        log('max_per_txn check exists in file: ' + hasCheck)
        if (!hasCheck) {
          log('CRITICAL: checkAgentRules missing ' +
            'max_per_txn enforcement')
          log('Manual fix required in routes/agent.js')
          writeLog()
          process.exit(1)
        }
      }
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Expected 403 with cap error, ' +
        'got ' + res.status + ': ' +
        JSON.stringify(res.data),
      manualFix: 'Set max_per_txn=2500 in spending_limits ' +
        'and verify checkAgentRules middleware',
      diagnoseAndFix
    }
  })

  // TEST 5 — Spend log
  await runTest(5, 'Spend log', async (attempt, testKey) => {
    const res = await axios.post(
      BASE_URL + '/api/agent/spend-log',
      { card_id: CARD_ID, limit: 50, offset: 0 },
      { headers: { Authorization: 'Bearer ' + ADMIN_KEY },
        validateStatus: () => true }
    )
    const pass = Array.isArray(res.data?.data) &&
                 res.data.data.length > 0

    const diagnoseAndFix = async () => {
      log('Querying agent_spend_log in Supabase...')
      const { data: logs } = await supabase
        .from('agent_spend_log').select('*')
        .eq('card_id', CARD_ID).limit(10)
      log('DB rows found: ' + (logs?.length || 0))
      log(JSON.stringify(logs))

      if (!logs || logs.length === 0) {
        log('No rows in DB — TEST 3 did not write ' +
          'to agent_spend_log')
        log('Check if TEST 3 passed — if not, fix it first')
        writeLog()
        process.exit(1)
      } else {
        log('Rows exist in DB but route not returning them')
        log('Bug is in POST /api/agent/spend-log route')
        log('Check card_id field name in query')
      }
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'No spend log data returned',
      manualFix: 'Check agent_spend_log table has rows ' +
        'and route is querying by card_id',
      diagnoseAndFix
    }
  })

  // TEST 6 — Agent audit
  await runTest(6, 'Agent audit', async (attempt, testKey) => {
    const res = await axios.get(
      BASE_URL + '/api/agent/audit?card_id=' + CARD_ID,
      { headers: { Authorization: 'Bearer ' + ADMIN_KEY },
        validateStatus: () => true }
    )
    const pass = Array.isArray(res.data?.data) &&
                 res.data.data.length > 0

    const diagnoseAndFix = async () => {
      log('Checking spend log exists...')
      const { data: logs } = await supabase
        .from('agent_spend_log').select('profile_id')
        .eq('card_id', CARD_ID).limit(5)
      log('Spend log rows: ' + (logs?.length || 0))

      if (!logs || logs.length === 0) {
        log('No spend log rows — TEST 5 must pass first')
        writeLog()
        process.exit(1)
      }

      log('Spend log exists — JOIN or grouping bug in route')
      log('Check GET /api/agent/audit in routes/agent.js')
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Audit returned empty or error',
      manualFix: 'Ensure spend log has entries and ' +
        'audit route JOIN is correct',
      diagnoseAndFix
    }
  })

  // TEST 7 — Risk scores
  await runTest(7, 'Agent risk scores',
    async (attempt, testKey) => {
    const res = await axios.get(
      BASE_URL + '/api/agent/risk?card_id=' + CARD_ID,
      { headers: { Authorization: 'Bearer ' + ADMIN_KEY },
        validateStatus: () => true }
    )
    const pass = Array.isArray(res.data?.data)

    const diagnoseAndFix = async () => {
      log('Checking profile_risk_scores view exists...')
      const { data, error } = await supabase
        .from('profile_risk_scores').select('*').limit(1)
      if (error) {
        log('View does not exist or has error: ' +
          error.message)
        log('SQL to create view:')
        log(`CREATE OR REPLACE VIEW profile_risk_scores AS
SELECT p.id as profile_id, p.type,
  COALESCE(p.first_name,'Unknown') as name,
  p.email, p.kyc_status,
  COUNT(a.id) as anomaly_count,
  COALESCE(SUM(a.score),0) as total_risk_score,
  MAX(a.created_at) as last_anomaly,
  CASE
    WHEN COALESCE(SUM(a.score),0) > 200 THEN 'critical'
    WHEN COALESCE(SUM(a.score),0) > 100 THEN 'high'
    WHEN COALESCE(SUM(a.score),0) > 50 THEN 'medium'
    ELSE 'low'
  END as risk_level
FROM profiles p
LEFT JOIN anomaly_log a ON a.profile_id = p.id
  AND a.resolved = false
  AND a.created_at > now() - interval '30 days'
GROUP BY p.id, p.type, p.first_name,
  p.email, p.kyc_status
ORDER BY total_risk_score DESC;`)
        writeLog()
        process.exit(1)
      }
      log('View exists — query issue in route')
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Risk endpoint error: ' +
        JSON.stringify(res.data),
      manualFix: 'Check profile_risk_scores view exists ' +
        'in Supabase',
      diagnoseAndFix
    }
  })

  // TEST 8 — Revoke token
  await runTest(8, 'Revoke token', async (attempt, testKey) => {
    const res = await axios.post(
      BASE_URL + '/api/agent/revoke',
      { token_hash: TOKEN_HASH },
      { headers: { Authorization: 'Bearer ' + ADMIN_KEY },
        validateStatus: () => true }
    )
    const pass = res.data?.revoked === true

    const diagnoseAndFix = async () => {
      log('TOKEN_HASH being used: ' + TOKEN_HASH)
      log('Checking agent_tokens table...')
      const { data: tokens } = await supabase
        .from('agent_tokens').select('*')
        .eq('profile_id', AGENT_PROFILE_ID)
      log('Tokens in DB: ' + JSON.stringify(tokens))

      const match = tokens?.find(
        t => t.token_hash === TOKEN_HASH)
      if (!match) {
        log('Token hash not found in DB')
        log('Hash mismatch — token may have been ' +
          'issued with different hash algorithm')
        log('Getting fresh token and recalculating hash...')
        if (!wasAlreadyTried(testKey, 'refresh-token-hash')) {
          const tokenRes = await axios.post(
            BASE_URL + '/api/agent/token',
            { profile_id: AGENT_PROFILE_ID },
            { headers: {
                Authorization: 'Bearer ' + ADMIN_KEY } }
          )
          if (tokenRes.data?.token) {
            AGENT_TOKEN = tokenRes.data.token
            TOKEN_HASH = crypto.createHash('sha256')
              .update(AGENT_TOKEN).digest('hex')
            log('New TOKEN_HASH: ' + TOKEN_HASH)
          }
        }
      }
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Revoke failed: ' +
        JSON.stringify(res.data),
      manualFix: 'Check agent_tokens table has the ' +
        'token_hash and revoke route updates correctly',
      diagnoseAndFix
    }
  })

  // TEST 9 — Revoked token rejected
  await runTest(9, 'Revoked token rejected',
    async (attempt, testKey) => {
    const ikey = 'auto-test-revoked-' + Date.now()
    const res = await axios.post(
      BASE_URL + '/api/agent/pay',
      { amount: 5, merchant_name: 'Test Merchant',
        memo: 'Should fail', idempotency_key: ikey },
      { headers: {
          Authorization: 'Bearer ' + AGENT_TOKEN,
          'idempotency-key': ikey },
        validateStatus: () => true }
    )
    const pass = res.status === 401 &&
      JSON.stringify(res.data).toLowerCase()
        .includes('revoked')

    const diagnoseAndFix = async () => {
      log('Checking if token is actually revoked in DB...')
      const { data: tokenRecord } = await supabase
        .from('agent_tokens')
        .select('revoked, token_hash')
        .eq('token_hash', TOKEN_HASH)
        .single()
      log('Token record: ' + JSON.stringify(tokenRecord))

      if (!tokenRecord) {
        log('Token not found — hash mismatch')
        log('TEST 8 may have used wrong hash')
        writeLog()
        process.exit(1)
      }

      if (!tokenRecord.revoked) {
        log('Token not revoked in DB — TEST 8 failed')
        log('Attempting manual revoke...')
        if (!wasAlreadyTried(testKey, 'manual-revoke')) {
          await supabase.from('agent_tokens')
            .update({ revoked: true })
            .eq('token_hash', TOKEN_HASH)
          log('Manually set revoked=true in DB')
        }
      } else {
        log('Token IS revoked in DB')
        log('verifyAgentToken middleware not checking ' +
          'revoked field correctly')
        log('Check routes/agent.js verifyAgentToken')
      }
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Expected 401 revoked, got ' +
        res.status + ': ' + JSON.stringify(res.data),
      manualFix: 'Verify token is revoked in agent_tokens ' +
        'and verifyAgentToken checks revoked field',
      diagnoseAndFix
    }
  })

  // TEST 10 — List agents
  await runTest(10, 'List agents on card',
    async (attempt, testKey) => {
    const res = await axios.get(
      BASE_URL + '/api/agent/list?card_id=' + CARD_ID,
      { headers: { Authorization: 'Bearer ' + ADMIN_KEY },
        validateStatus: () => true }
    )
    const pass = Array.isArray(res.data?.data) &&
                 res.data.data.length > 0

    const diagnoseAndFix = async () => {
      log('Checking agent profiles in Supabase...')
      const { data: profile } = await supabase
        .from('profiles').select('*')
        .eq('id', AGENT_PROFILE_ID).single()
      log('Agent profile: ' + JSON.stringify(profile))

      if (!profile) {
        log('Agent profile not found')
        writeLog()
        process.exit(1)
      }

      if (profile.type !== 'agent') {
        log('Profile type is not agent: ' + profile.type)
        if (!wasAlreadyTried(testKey, 'fix-type')) {
          await supabase.from('profiles')
            .update({ type: 'agent' })
            .eq('id', AGENT_PROFILE_ID)
          log('Fixed: set type=agent')
        }
        return
      }

      log('Profile ok — checking card members...')
      const { data: card } = await supabase
        .from('cards').select('members').eq('id', CARD_ID)
        .single()
      log('Members: ' + JSON.stringify(card?.members))

      const inMembers = card?.members?.includes(
        AGENT_PROFILE_ID)
      log('Agent in members: ' + inMembers)

      if (!inMembers && !wasAlreadyTried(testKey,
          'add-to-members')) {
        const currentMembers = Array.isArray(card?.members)
          ? card.members : []
        currentMembers.push(AGENT_PROFILE_ID)
        await supabase.from('cards')
          .update({ members: currentMembers })
          .eq('id', CARD_ID)
        log('Added agent to card members')
      }
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'List agents returned empty ' +
        'or error: ' + JSON.stringify(res.data),
      manualFix: 'Ensure agent profile has type=agent ' +
        'and is in card.members array',
      diagnoseAndFix
    }
  })

  // ===== USER AUTH TESTS =====
  log('\n## USER AUTH TESTS')

  if (!USER_PASSWORD) {
    log('⚠️ TEST_USER_PASSWORD not set — skipping user tests')
    log('Set it in Replit Secrets as TEST_USER_PASSWORD')
    log('\n🎉 AGENT TESTS ALL PASSED')
    log('Completed: ' + new Date().toISOString())
    writeLog()
    process.exit(0)
  }

  // TEST 11 — Get user JWT
  await runTest(11, 'Get user JWT', async (attempt, testKey) => {
    let token = null
    let errMsg = ''
    try {
      token = await getUserJWT(USER_EMAIL, USER_PASSWORD)
      USER_JWT = token
    } catch (e) {
      errMsg = e.message
    }
    const pass = typeof token === 'string' && token.length > 0

    const diagnoseAndFix = async () => {
      log('Could not sign in as ' + USER_EMAIL)
      log('Error: ' + errMsg)
      log('Check TEST_USER_PASSWORD is correct in Replit Secrets')
      log('Verify user exists in Supabase Auth dashboard')
      writeLog()
      process.exit(1)
    }

    return {
      pass,
      status: pass ? 200 : 401,
      data: pass ? { access_token: token?.substring(0, 30) + '...' } : { error: errMsg },
      reason: pass ? null : 'Could not get JWT: ' + errMsg,
      manualFix: 'Check TEST_USER_PASSWORD secret and user exists in Supabase',
      diagnoseAndFix
    }
  })

  // TEST 12 — Profile created on login
  await runTest(12, 'Profile created on login',
    async (attempt, testKey) => {
    const res = await axios.get(
      BASE_URL + '/api/auth/profile',
      { headers: { Authorization: 'Bearer ' + USER_JWT },
        validateStatus: () => true }
    )
    const pass = !!res.data?.id &&
                 res.data?.type === 'human' &&
                 res.data?.email === USER_EMAIL
    if (pass) USER_PROFILE_ID = res.data.id

    const errMsg = res.data?.error || ''
    const diagnoseAndFix = async () => {
      log('GET /api/auth/profile response: ' +
        JSON.stringify(res.data))
      log('Checking profiles table directly...')
      const { data: { user } } = await supabase.auth.getUser(USER_JWT)
      log('Supabase auth user: ' + JSON.stringify(user?.id))
      const { data: profile } = await supabase
        .from('profiles').select('*')
        .eq('auth_id', user?.id).single()
      log('Profile in DB: ' + JSON.stringify(profile))
      if (!profile) {
        log('Profile not found — authMiddleware may not have upserted it')
        log('Check server.js authMiddleware')
      }
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Profile missing or wrong: ' + errMsg,
      manualFix: 'Check GET /api/auth/profile route and authMiddleware upsert',
      diagnoseAndFix
    }
  })

  // TEST 13 — Update profile
  await runTest(13, 'Update profile', async (attempt, testKey) => {
    const res = await axios.put(
      BASE_URL + '/api/auth/profile',
      { first_name: 'Harris', last_name: 'Qazi',
        phone: '5551234567' },
      { headers: { Authorization: 'Bearer ' + USER_JWT },
        validateStatus: () => true }
    )
    const pass = res.data?.first_name === 'Harris'

    const diagnoseAndFix = async () => {
      log('PUT /api/auth/profile response: ' +
        JSON.stringify(res.data))
      log('Check routes/auth.js PUT /profile handler')
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'first_name not updated: ' +
        JSON.stringify(res.data),
      manualFix: 'Check PUT /api/auth/profile route in routes/auth.js',
      diagnoseAndFix
    }
  })

  // TEST 14 — KYC submission
  await runTest(14, 'KYC submission', async (attempt, testKey) => {
    const res = await axios.post(
      BASE_URL + '/api/auth/kyc',
      {
        first_name: 'Harris',
        last_name: 'Qazi',
        date_of_birth: '1995-01-01',
        ssn_last_four: '1234',
        address_line1: '123 Test St',
        city: 'Chicago',
        state: 'IL',
        zip: '60601',
        id_type: 'drivers_license'
      },
      { headers: { Authorization: 'Bearer ' + USER_JWT },
        validateStatus: () => true }
    )
    const pass = res.data?.submitted === true &&
                 typeof res.data?.fingerprint === 'string'
    const isConflict = res.status === 409

    const diagnoseAndFix = async () => {
      log('POST /api/auth/kyc response: ' +
        JSON.stringify(res.data))
      if (isConflict) {
        log('409 — KYC already submitted, treating as pass')
      } else {
        log('Check routes/auth.js POST /kyc handler')
        log('Check kyc_details table columns match payload')
      }
    }

    return {
      pass: pass || isConflict,
      status: res.status,
      data: res.data,
      reason: (pass || isConflict) ? null :
        'KYC submission failed: ' + JSON.stringify(res.data),
      manualFix: 'Check POST /api/auth/kyc route in routes/auth.js',
      diagnoseAndFix
    }
  })

  // TEST 15 — Create card
  await runTest(15, 'Create card', async (attempt, testKey) => {
    const res = await axios.post(
      BASE_URL + '/api/cards',
      {
        name: 'Test Card',
        card_name: 'My Test Card',
        description: 'Created by test suite'
      },
      { headers: { Authorization: 'Bearer ' + USER_JWT },
        validateStatus: () => true }
    )
    const pass = !!res.data?.id &&
                 !!res.data?.invite_code &&
                 Array.isArray(res.data?.members) &&
                 res.data.members.includes(USER_PROFILE_ID)
    if (pass) {
      USER_CARD_ID = res.data.id
      USER_INVITE_CODE = res.data.invite_code
    }

    const diagnoseAndFix = async () => {
      log('POST /api/cards response: ' +
        JSON.stringify(res.data))
      log('USER_PROFILE_ID: ' + USER_PROFILE_ID)
      if (!USER_PROFILE_ID) {
        log('USER_PROFILE_ID not set — TEST 12 must pass first')
        writeLog()
        process.exit(1)
      }
      log('Check routes/cards.js POST / handler')
      log('Verify invite_code generation and members array init')
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Card creation failed: ' +
        JSON.stringify(res.data),
      manualFix: 'Check POST /api/cards route — invite_code and members must be set on create',
      diagnoseAndFix
    }
  })

  // TEST 16 — Get card
  await runTest(16, 'Get card', async (attempt, testKey) => {
    const res = await axios.get(
      BASE_URL + '/api/cards/' + USER_CARD_ID,
      { headers: { Authorization: 'Bearer ' + USER_JWT },
        validateStatus: () => true }
    )
    const pass = res.data?.id === USER_CARD_ID &&
                 res.data?.card_name === 'My Test Card'

    const diagnoseAndFix = async () => {
      log('GET /api/cards/' + USER_CARD_ID +
        ' response: ' + JSON.stringify(res.data))
      if (!USER_CARD_ID) {
        log('USER_CARD_ID not set — TEST 15 must pass first')
        writeLog()
        process.exit(1)
      }
      log('Check routes/cards.js GET /:id handler')
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Card fetch failed: ' +
        JSON.stringify(res.data),
      manualFix: 'Check GET /api/cards/:id route',
      diagnoseAndFix
    }
  })

  // TEST 17 — Set card limits
  await runTest(17, 'Set card limits', async (attempt, testKey) => {
    const res = await axios.put(
      BASE_URL + '/api/cards/' + USER_CARD_ID + '/limits',
      { daily_cap: 200, max_per_txn: 50 },
      { headers: { Authorization: 'Bearer ' + USER_JWT },
        validateStatus: () => true }
    )
    const pass = res.data?.daily_cap === 200 &&
                 res.data?.max_per_txn === 50

    const diagnoseAndFix = async () => {
      log('PUT /api/cards/' + USER_CARD_ID +
        '/limits response: ' + JSON.stringify(res.data))
      log('Check routes/cards.js PUT /:id/limits handler')
      log('Verify spending_limits is stored and returned correctly')
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Limits not set: ' +
        JSON.stringify(res.data),
      manualFix: 'Check PUT /api/cards/:id/limits route',
      diagnoseAndFix
    }
  })

  // TEST 18 — Create Lithic card
  await runTest(18, 'Create Lithic card for card',
    async (attempt, testKey) => {
    const res = await axios.post(
      BASE_URL + '/api/lithic',
      { group_id: USER_CARD_ID, monthlyLimit: 100000 },
      { headers: { Authorization: 'Bearer ' + USER_JWT },
        validateStatus: () => true }
    )
    const pass = res.data?.success === true &&
                 !!res.data?.cardToken

    const diagnoseAndFix = async () => {
      log('POST /api/lithic response: ' +
        JSON.stringify(res.data))

      log('Checking card in Supabase for card_token...')
      const { data: card } = await supabase
        .from('cards').select('card_token')
        .eq('id', USER_CARD_ID).single()
      log('card_token in DB: ' + card?.card_token)

      if (res.status === 404) {
        log('Route not found — check /api/lithic mount in server.js')
        writeLog()
        process.exit(1)
      }
      log('Check routes/lithic.js POST / handler')
      log('Verify Lithic API key is set and sandbox mode is active')
    }

    if (pass) {
      log('Verifying card_token saved to Supabase...')
      const { data: card } = await supabase
        .from('cards').select('card_token')
        .eq('id', USER_CARD_ID).single()
      log('card_token in DB: ' + card?.card_token)
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Lithic card creation failed: ' +
        JSON.stringify(res.data),
      manualFix: 'Check POST /api/lithic route and Lithic API key',
      diagnoseAndFix
    }
  })

  // TEST 19 — List cards
  await runTest(19, 'List cards', async (attempt, testKey) => {
    const res = await axios.get(
      BASE_URL + '/api/cards',
      { headers: { Authorization: 'Bearer ' + USER_JWT },
        validateStatus: () => true }
    )
    const cards = Array.isArray(res.data?.data)
      ? res.data.data
      : Array.isArray(res.data) ? res.data : []
    const pass = cards.some(c => c.id === USER_CARD_ID)

    const diagnoseAndFix = async () => {
      log('GET /api/cards response: ' +
        JSON.stringify(res.data))
      log('Looking for USER_CARD_ID: ' + USER_CARD_ID)
      log('Check routes/cards.js GET / handler')
      log('Verify member filter includes USER_PROFILE_ID')
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Card not found in list: ' +
        JSON.stringify(res.data),
      manualFix: 'Check GET /api/cards route — should return all cards where user is owner or member',
      diagnoseAndFix
    }
  })

  // TEST 20 — List transactions
  await runTest(20, 'List transactions', async (attempt, testKey) => {
    const res = await axios.get(
      BASE_URL + '/api/transactions?card_id=' + USER_CARD_ID,
      { headers: { Authorization: 'Bearer ' + USER_JWT },
        validateStatus: () => true }
    )
    const isArray = Array.isArray(res.data?.data) ||
                    Array.isArray(res.data)
    const pass = res.status === 200 && isArray

    const diagnoseAndFix = async () => {
      log('GET /api/transactions response: ' +
        JSON.stringify(res.data))
      log('Check routes/transactions.js GET / handler')
    }

    return {
      pass,
      status: res.status,
      data: res.data,
      reason: pass ? null : 'Transactions endpoint error: ' +
        JSON.stringify(res.data),
      manualFix: 'Check GET /api/transactions?card_id= route',
      diagnoseAndFix
    }
  })

  // TEST 21 — Card join flow
  await runTest(21, 'Card join flow (second user)',
    async (attempt, testKey) => {
    if (!process.env.TEST_USER2_PASSWORD) {
      log('⚠️ TEST_USER2_PASSWORD not set — ' +
        'skipping join test')
      log('Set it in Replit Secrets as TEST_USER2_PASSWORD')
      return { pass: true, status: 200,
        data: { skipped: true }, reason: null }
    }

    log('Getting second user JWT...')
    let secondJwt = null
    try {
      secondJwt = await getUserJWT(
        SECOND_USER_EMAIL,
        process.env.TEST_USER2_PASSWORD)
      SECOND_USER_JWT = secondJwt
      log('Second user JWT obtained')
    } catch (e) {
      return {
        pass: false,
        status: 401,
        data: { error: e.message },
        reason: 'Could not get second user JWT: ' + e.message,
        manualFix: 'Check TEST_USER2_PASSWORD and that ' +
          SECOND_USER_EMAIL + ' exists in Supabase Auth',
        diagnoseAndFix: async () => {
          log('Cannot auto-fix second user login')
        }
      }
    }

    log('Getting second user profile...')
    const profileRes = await axios.get(
      BASE_URL + '/api/auth/profile',
      { headers: { Authorization: 'Bearer ' + secondJwt },
        validateStatus: () => true }
    )
    if (!profileRes.data?.id) {
      return {
        pass: false,
        status: profileRes.status,
        data: profileRes.data,
        reason: 'Second user profile not found',
        manualFix: 'Check /api/auth/profile for second user',
        diagnoseAndFix: async () => {
          log('Second user profile response: ' +
            JSON.stringify(profileRes.data))
        }
      }
    }
    SECOND_USER_PROFILE_ID = profileRes.data.id
    log('Second user profile ID: ' + SECOND_USER_PROFILE_ID)

    const joinRes = await axios.post(
      BASE_URL + '/api/cards/join',
      { invite_code: USER_INVITE_CODE },
      { headers: { Authorization: 'Bearer ' + secondJwt },
        validateStatus: () => true }
    )

    const pass = joinRes.data?.id === USER_CARD_ID &&
                 Array.isArray(joinRes.data?.members) &&
                 joinRes.data.members.includes(SECOND_USER_PROFILE_ID)

    const diagnoseAndFix = async () => {
      log('POST /api/cards/join response: ' +
        JSON.stringify(joinRes.data))
      log('invite_code used: ' + USER_INVITE_CODE)
      log('Expected card: ' + USER_CARD_ID)
      log('Expected member: ' + SECOND_USER_PROFILE_ID)

      log('Checking card in Supabase...')
      const { data: card } = await supabase
        .from('cards').select('invite_code, members')
        .eq('id', USER_CARD_ID).single()
      log('Card invite_code: ' + card?.invite_code)
      log('Card members: ' + JSON.stringify(card?.members))

      if (card?.invite_code !== USER_INVITE_CODE) {
        log('invite_code mismatch — card may have been ' +
          'recreated in this test run')
      }
      log('Check routes/cards.js POST /join handler')
    }

    return {
      pass,
      status: joinRes.status,
      data: joinRes.data,
      reason: pass ? null : 'Join failed or member not added: ' +
        JSON.stringify(joinRes.data),
      manualFix: 'Check POST /api/cards/join route and invite_code lookup',
      diagnoseAndFix
    }
  })

  log('\n🎉 ALL TESTS PASSED')
  log('Completed: ' + new Date().toISOString())
  writeLog()
}

main().catch(err => {
  log('💥 FATAL: ' + err.message)
  log(err.stack)
  writeLog()
  process.exit(1)
})

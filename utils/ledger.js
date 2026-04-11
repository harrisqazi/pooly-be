// MODIFIED: 2026-04-11 — fix createLedgerEntry to match actual ledger_entries schema
const { supabase } = require('../config/providers');

/**
 * Create a double-entry ledger entry
 * Inserts ONE row per call using the confirmed schema:
 *   id, transaction_id, debit_account, credit_account, amount, created_at
 * amount must be in CENTS (bigint)
 */
async function createLedgerEntry({
  transaction_id = null,
  debit_account,
  credit_account,
  amount
}) {
  const { data, error } = await supabase
    .from('ledger_entries')
    .insert({
      transaction_id,
      debit_account,
      credit_account,
      amount,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Ledger entry failed: ${error.message}`);
  }

  return data;
}

/**
 * Update group balance based on ledger entries
 * Computes: SUM(credit_account amounts) - SUM(debit_account amounts)
 * where cash appears as credit_account = incoming funds
 * @param {string} group_id - Group ID
 */
async function updateGroupBalance(group_id) {
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('id')
    .eq('group_id', group_id);

  if (txError) {
    throw new Error(`Failed to fetch transactions: ${txError.message}`);
  }

  const txIds = (transactions || []).map(t => t.id);

  let balance = 0;

  if (txIds.length > 0) {
    const { data: entries, error } = await supabase
      .from('ledger_entries')
      .select('debit_account, credit_account, amount')
      .in('transaction_id', txIds);

    if (error) {
      throw new Error(`Failed to fetch ledger entries: ${error.message}`);
    }

    (entries || []).forEach(entry => {
      if (entry.credit_account === 'cash') {
        balance += Number(entry.amount);
      } else if (entry.debit_account === 'cash') {
        balance -= Number(entry.amount);
      }
    });
  }

  const { error: updateError } = await supabase
    .from('groups')
    .update({ total_balance: balance })
    .eq('id', group_id);

  if (updateError) {
    throw new Error(`Failed to update group balance: ${updateError.message}`);
  }

  return balance;
}

module.exports = {
  createLedgerEntry,
  updateGroupBalance
};

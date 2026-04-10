// Double-entry ledger utilities
const { supabase } = require('../config/providers');

/**
 * Create a double-entry ledger entry
 * @param {Object} params
 * @param {string} params.group_id - Group ID
 * @param {string} params.transaction_id - Transaction ID (optional)
 * @param {string} params.debit_account - Account to debit
 * @param {string} params.credit_account - Account to credit
 * @param {number} params.amount - Amount in cents
 * @param {string} params.description - Description
 * @param {Object} params.metadata - Additional metadata
 */
async function createLedgerEntry({
  group_id,
  transaction_id = null,
  debit_account,
  credit_account,
  amount,
  description,
  metadata = {}
}) {
  const entries = [
    {
      group_id,
      transaction_id,
      account: debit_account,
      type: 'debit',
      amount,
      description,
      metadata,
      created_at: new Date().toISOString()
    },
    {
      group_id,
      transaction_id,
      account: credit_account,
      type: 'credit',
      amount,
      description,
      metadata,
      created_at: new Date().toISOString()
    }
  ];

  const { data, error } = await supabase
    .from('ledger_entries')
    .insert(entries)
    .select();

  if (error) {
    throw new Error(`Ledger entry failed: ${error.message}`);
  }

  return data;
}

/**
 * Update group balance based on ledger entries
 * @param {string} group_id - Group ID
 */
async function updateGroupBalance(group_id) {
  const { data: entries, error } = await supabase
    .from('ledger_entries')
    .select('type, amount')
    .eq('group_id', group_id);

  if (error) {
    throw new Error(`Failed to fetch ledger entries: ${error.message}`);
  }

  let balance = 0;
  entries.forEach(entry => {
    if (entry.type === 'debit') {
      balance += entry.amount;
    } else {
      balance -= entry.amount;
    }
  });

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

// MODIFIED: 2026-04-11 — rename updateGroupBalance → updateCardBalance,
//   query transactions by card_id, update cards table; export alias for compat
const { supabase } = require('../config/providers');

/**
 * Create a double-entry ledger entry.
 * Inserts ONE row with exactly the confirmed schema columns.
 * amount must be in CENTS (bigint).
 */
async function createLedgerEntry({ transaction_id = null, debit_account, credit_account, amount }) {
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

  if (error) throw new Error(`Ledger entry failed: ${error.message}`);
  return data;
}

/**
 * Recompute and update a card's total_balance from its ledger entries.
 * @param {string} card_id — the cards.id (wallet card)
 */
async function updateCardBalance(card_id) {
  const { data: txRows, error: txError } = await supabase
    .from('transactions')
    .select('id')
    .eq('card_id', card_id);

  if (txError) throw new Error(`Failed to fetch transactions: ${txError.message}`);

  const txIds = (txRows || []).map(t => t.id);
  let balance = 0;

  if (txIds.length > 0) {
    const { data: entries, error } = await supabase
      .from('ledger_entries')
      .select('debit_account, credit_account, amount')
      .in('transaction_id', txIds);

    if (error) throw new Error(`Failed to fetch ledger entries: ${error.message}`);

    for (const entry of entries || []) {
      if (entry.credit_account === 'cash') balance += Number(entry.amount);
      else if (entry.debit_account === 'cash') balance -= Number(entry.amount);
    }
  }

  const { error: updateError } = await supabase
    .from('cards')
    .update({ total_balance: balance })
    .eq('id', card_id);

  if (updateError) throw new Error(`Failed to update card balance: ${updateError.message}`);
  return balance;
}

module.exports = {
  createLedgerEntry,
  updateCardBalance,
  updateGroupBalance: updateCardBalance
};

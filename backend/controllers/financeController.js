const { all, get, run } = require('../config/database');
const { sendSuccess } = require('../utils/response');

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function nextSevenDays() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function normalizeMonth(month) {
  return month || currentMonth();
}

function normalizeDate(date) {
  return date || null;
}

async function buildBudgetOverview(userId, month) {
  const budgets = await all('SELECT * FROM budgets WHERE user_id = ? AND month = ? ORDER BY category ASC', [userId, month]);
  const spentRows = await all(
    `SELECT category, SUM(amount) as spent
     FROM expenses
     WHERE user_id = ? AND type = 'expense' AND substr(date, 1, 7) = ?
     GROUP BY category`,
    [userId, month]
  );
  const spentMap = new Map(spentRows.map((row) => [row.category, Number(row.spent || 0)]));
  const categories = new Set([...budgets.map((budget) => budget.category), ...spentRows.map((row) => row.category)]);

  const rows = [...categories].map((category) => {
    const budget = budgets.find((item) => item.category === category);
    const limit = Number(budget?.limit_amount || 0);
    const spent = spentMap.get(category) || 0;
    const remaining = limit - spent;
    const usedPercent = limit ? Math.round((spent / limit) * 100) : 0;
    return {
      id: budget?.id || null,
      month,
      category,
      limit_amount: limit,
      spent,
      remaining_budget: remaining,
      used_percent: usedPercent,
      flag: limit && spent > limit ? 'overbudget' : usedPercent >= 85 ? 'near_limit' : 'ok',
      warning: limit && spent > limit ? `${category} is over budget` : usedPercent >= 85 ? `You've used ${usedPercent}% of your ${category} budget` : ''
    };
  });

  return {
    month,
    categories: rows,
    total_budget: rows.reduce((sum, row) => sum + row.limit_amount, 0),
    total_spent: rows.reduce((sum, row) => sum + row.spent, 0),
    remaining_budget: rows.reduce((sum, row) => sum + row.remaining_budget, 0),
    warnings: rows.filter((row) => row.flag !== 'ok')
  };
}

async function listBudget(req, res, next) {
  try {
    const month = normalizeMonth(req.query.month);
    sendSuccess(res, { budget: await buildBudgetOverview(req.user.id, month) }, 'Budget loaded');
  } catch (err) {
    next(err);
  }
}

async function upsertBudget(req, res, next) {
  try {
    const { month = currentMonth(), category, limit_amount } = req.body;
    await run(
      `INSERT INTO budgets (user_id, month, category, limit_amount)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, month, category)
       DO UPDATE SET limit_amount = excluded.limit_amount, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, month, category, Number(limit_amount)]
    );
    sendSuccess(res, { budget: await buildBudgetOverview(req.user.id, month) }, 'Budget saved');
  } catch (err) {
    next(err);
  }
}

async function updateBudget(req, res, next) {
  try {
    const current = await get('SELECT * FROM budgets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!current) return res.status(404).json({ success: false, data: {}, message: 'Budget not found' });
    const nextBudget = { ...current, ...req.body };
    await run('UPDATE budgets SET month = ?, category = ?, limit_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [
      nextBudget.month,
      nextBudget.category,
      Number(nextBudget.limit_amount),
      req.params.id,
      req.user.id
    ]);
    sendSuccess(res, { budget: await buildBudgetOverview(req.user.id, nextBudget.month) }, 'Budget updated');
  } catch (err) {
    next(err);
  }
}

async function deleteBudget(req, res, next) {
  try {
    const current = await get('SELECT month FROM budgets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    await run('DELETE FROM budgets WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    sendSuccess(res, { budget: await buildBudgetOverview(req.user.id, current?.month || currentMonth()) }, 'Budget deleted');
  } catch (err) {
    next(err);
  }
}

async function listExpenses(req, res, next) {
  try {
    const params = [req.user.id];
    let where = 'WHERE user_id = ?';
    if (req.query.category) {
      where += ' AND category = ?';
      params.push(req.query.category);
    }
    if (req.query.date) {
      where += ' AND date = ?';
      params.push(req.query.date);
    }
    if (req.query.month) {
      where += ' AND substr(date, 1, 7) = ?';
      params.push(req.query.month);
    }

    const expenses = await all(`SELECT * FROM expenses ${where} ORDER BY date DESC, created_at DESC LIMIT 80`, params);
    const daily = await all(
      `SELECT date,
        SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END) as net,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as spent
       FROM expenses WHERE user_id = ? GROUP BY date ORDER BY date DESC LIMIT 14`,
      [req.user.id]
    );
    const weekly = await all(
      `SELECT strftime('%Y-W%W', date) as week,
        SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END) as net,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as spent
       FROM expenses WHERE user_id = ? GROUP BY week ORDER BY week DESC LIMIT 8`,
      [req.user.id]
    );
    sendSuccess(res, { expenses, daily, weekly }, 'Expenses loaded');
  } catch (err) {
    next(err);
  }
}

async function createExpense(req, res, next) {
  try {
    const { amount, category, description = '', date, type = 'expense', title } = req.body;
    const result = await run(
      'INSERT INTO expenses (user_id, title, amount, category, description, date, type, spent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, title || description || category, Number(amount), category, description || title || '', date, type, date]
    );
    const expense = await get('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [result.id, req.user.id]);
    sendSuccess(res, { expense }, 'Expense saved', 201);
  } catch (err) {
    next(err);
  }
}

async function deleteExpense(req, res, next) {
  try {
    await run('DELETE FROM expenses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    sendSuccess(res, {}, 'Expense deleted');
  } catch (err) {
    next(err);
  }
}

async function summary(req, res, next) {
  try {
    const date = normalizeDate(req.query.date);
    const month = normalizeMonth(req.query.month || (date ? date.slice(0, 7) : null));
    const timeClause = date ? 'date = ?' : 'substr(date, 1, 7) = ?';
    const timeValue = date || month;
    const totals = await get(
      `SELECT
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_spent,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income
       FROM expenses WHERE user_id = ? AND ${timeClause}`,
      [req.user.id, timeValue]
    );
    const breakdown = await all(
      `SELECT category, SUM(amount) as total FROM expenses
       WHERE user_id = ? AND type = 'expense' AND ${timeClause}
       GROUP BY category ORDER BY total DESC`,
      [req.user.id, timeValue]
    );
    const budget = await buildBudgetOverview(req.user.id, month);
    sendSuccess(res, {
      month,
      date,
      scope: date ? 'day' : 'month',
      total_spent: Number(totals?.total_spent || 0),
      total_income: Number(totals?.total_income || 0),
      net: Number(totals?.total_income || 0) - Number(totals?.total_spent || 0),
      category_breakdown: breakdown,
      biggest_spending_category: breakdown[0] || null,
      budget
    }, 'Monthly summary loaded');
  } catch (err) {
    next(err);
  }
}

async function listSavingsGoals(req, res, next) {
  try {
    const goals = await all('SELECT * FROM savings_goals WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    sendSuccess(res, { goals: goals.map((goal) => ({ ...goal, progress: goal.target_amount ? Math.min(100, Math.round((goal.saved_amount / goal.target_amount) * 100)) : 0 })) }, 'Savings goals loaded');
  } catch (err) {
    next(err);
  }
}

async function createSavingsGoal(req, res, next) {
  try {
    const { title, target_amount, saved_amount = 0, deadline = null } = req.body;
    const result = await run('INSERT INTO savings_goals (user_id, title, target_amount, saved_amount, deadline) VALUES (?, ?, ?, ?, ?)', [
      req.user.id,
      title,
      Number(target_amount),
      Number(saved_amount),
      deadline
    ]);
    sendSuccess(res, { goal: await get('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [result.id, req.user.id]) }, 'Savings goal created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateSavingsGoal(req, res, next) {
  try {
    const current = await get('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!current) return res.status(404).json({ success: false, data: {}, message: 'Savings goal not found' });
    const nextGoal = { ...current, ...req.body };
    await run('UPDATE savings_goals SET title = ?, target_amount = ?, saved_amount = ?, deadline = ? WHERE id = ? AND user_id = ?', [
      nextGoal.title,
      Number(nextGoal.target_amount),
      Number(nextGoal.saved_amount),
      nextGoal.deadline || null,
      req.params.id,
      req.user.id
    ]);
    sendSuccess(res, { goal: await get('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]) }, 'Savings goal updated');
  } catch (err) {
    next(err);
  }
}

async function listSubscriptions(req, res, next) {
  try {
    const subscriptions = await all('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY active DESC, next_due_date ASC', [req.user.id]);
    const upcoming = subscriptions.filter((item) => item.active && item.next_due_date <= nextSevenDays());
    sendSuccess(res, { subscriptions, upcoming }, 'Subscriptions loaded');
  } catch (err) {
    next(err);
  }
}

async function createSubscription(req, res, next) {
  try {
    const { name, cost, billing_cycle = 'monthly', next_due_date } = req.body;
    const result = await run('INSERT INTO subscriptions (user_id, name, cost, billing_cycle, next_due_date) VALUES (?, ?, ?, ?, ?)', [
      req.user.id,
      name,
      Number(cost),
      billing_cycle,
      next_due_date
    ]);
    sendSuccess(res, { subscription: await get('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?', [result.id, req.user.id]) }, 'Subscription created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateSubscription(req, res, next) {
  try {
    const current = await get('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!current) return res.status(404).json({ success: false, data: {}, message: 'Subscription not found' });
    const nextSub = { ...current, ...req.body };
    await run('UPDATE subscriptions SET name = ?, cost = ?, billing_cycle = ?, next_due_date = ?, active = ? WHERE id = ? AND user_id = ?', [
      nextSub.name,
      Number(nextSub.cost),
      nextSub.billing_cycle,
      nextSub.next_due_date,
      nextSub.active ? 1 : 0,
      req.params.id,
      req.user.id
    ]);
    sendSuccess(res, { subscription: await get('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]) }, 'Subscription updated');
  } catch (err) {
    next(err);
  }
}

async function deleteSubscription(req, res, next) {
  try {
    await run('DELETE FROM subscriptions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    sendSuccess(res, {}, 'Subscription deleted');
  } catch (err) {
    next(err);
  }
}

async function listBills(req, res, next) {
  try {
    const bills = await all('SELECT * FROM bills WHERE user_id = ? ORDER BY status ASC, due_date ASC', [req.user.id]);
    const upcoming = bills.filter((bill) => bill.status === 'pending' && bill.due_date <= nextSevenDays());
    sendSuccess(res, { bills, upcoming }, 'Bills loaded');
  } catch (err) {
    next(err);
  }
}

async function createBill(req, res, next) {
  try {
    const { title, amount, due_date, status = 'pending' } = req.body;
    const result = await run('INSERT INTO bills (user_id, title, amount, due_date, status) VALUES (?, ?, ?, ?, ?)', [
      req.user.id,
      title,
      Number(amount),
      due_date,
      status
    ]);
    sendSuccess(res, { bill: await get('SELECT * FROM bills WHERE id = ? AND user_id = ?', [result.id, req.user.id]) }, 'Bill created', 201);
  } catch (err) {
    next(err);
  }
}

async function updateBill(req, res, next) {
  try {
    const current = await get('SELECT * FROM bills WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!current) return res.status(404).json({ success: false, data: {}, message: 'Bill not found' });
    const nextBill = { ...current, ...req.body };
    await run('UPDATE bills SET title = ?, amount = ?, due_date = ?, status = ? WHERE id = ? AND user_id = ?', [
      nextBill.title,
      Number(nextBill.amount),
      nextBill.due_date,
      nextBill.status,
      req.params.id,
      req.user.id
    ]);
    sendSuccess(res, { bill: await get('SELECT * FROM bills WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]) }, 'Bill updated');
  } catch (err) {
    next(err);
  }
}

async function deleteBill(req, res, next) {
  try {
    await run('DELETE FROM bills WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    sendSuccess(res, {}, 'Bill deleted');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listBudget,
  upsertBudget,
  updateBudget,
  deleteBudget,
  listExpenses,
  createExpense,
  deleteExpense,
  summary,
  listSavingsGoals,
  createSavingsGoal,
  updateSavingsGoal,
  listSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  listBills,
  createBill,
  updateBill,
  deleteBill
};

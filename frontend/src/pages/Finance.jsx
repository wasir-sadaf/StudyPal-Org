import { Bell, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { Pie } from 'react-chartjs-2';
import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip
} from 'chart.js';
import Card from '../components/ui/Card';
import ProgressBar from '../components/ui/ProgressBar';
import CircularProgress from '../components/ui/CircularProgress';
import AddTransactionModal from '../components/finance/AddTransactionModal';
import api from '../services/api';
import { shiftDate, today } from '../utils/format';

ChartJS.register(ArcElement, Tooltip, Legend);

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0));

export default function Finance() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today());
  const [data, setData] = useState({ expenses: [], budgets: [], overview: {}, goals: [] });
  const selectedMonth = selectedDate.slice(0, 7);
  const selectedDateLabel = useMemo(() => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(year, month - 1, day));
  }, [selectedDate]);

  const loadData = async () => {
    try {
      const [summaryRes, expensesRes, goalsRes] = await Promise.all([
        api.get(`/finance/summary?date=${selectedDate}`),
        api.get(`/finance/expenses?date=${selectedDate}`),
        api.get(`/finance/goals`)
      ]);
      setData({
        expenses: expensesRes.data.expenses || [],
        overview: {
          total_month: summaryRes.data.total_spent,
          total_income: summaryRes.data.total_income,
          net: summaryRes.data.net,
          category_breakdown: summaryRes.data.category_breakdown || []
        },
        budgets: summaryRes.data.budget?.categories || [],
        goals: goalsRes.data.goals || []
      });
    } catch (error) {
      console.error('Failed to load finance data', error);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const pieChartData = useMemo(() => {
    if (data.expenses.length === 0) {
      return {
        labels: [],
        datasets: [{ data: [], backgroundColor: [], borderWidth: 0 }]
      };
    }

    // Aggregate real data by category
    const categoryTotals = data.expenses.reduce((acc, exp) => {
      acc[exp.category] = (acc[exp.category] || 0) + Number(exp.amount);
      return acc;
    }, {});
    
    return {
      labels: Object.keys(categoryTotals),
      datasets: [{
        data: Object.values(categoryTotals),
        backgroundColor: ['#d97706', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b', '#6366f1', '#14b8a6', '#f43f5e'],
        borderWidth: 0,
      }]
    };
  }, [data.expenses]);

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { 
      legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, font: { family: 'ui-sans-serif, system-ui, sans-serif' } } },
      tooltip: {
        callbacks: {
          label: (context) => ` ${context.label}: ${money(context.raw)}`
        }
      }
    }
  };

  const totalSpent = data.overview.total_month || 0;
  const totalIncome = data.overview.total_income || 0;
  const netBalance = data.overview.net || 0;
  const hasTransactions = data.expenses.length > 0;

  return (
    <div className="mx-auto max-w-7xl grid gap-6 pb-10">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-gray-800">
        <h1 className="font-serif text-3xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
            <button type="button" onClick={() => setSelectedDate((current) => shiftDate(current, -1))} className="rounded p-1 text-gray-500 hover:bg-slate-100 dark:hover:bg-gray-800">
              <ChevronLeft size={16} />
            </button>
            <div className="relative">
              <span className="inline-flex min-w-28 cursor-pointer items-center justify-center rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                {selectedDateLabel}
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                aria-label="Select finance history date"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
            <button type="button" onClick={() => setSelectedDate((current) => shiftDate(current, 1))} className="rounded p-1 text-gray-500 hover:bg-slate-100 dark:hover:bg-gray-800">
              <ChevronRight size={16} />
            </button>
          </div>
          <button className="relative rounded-full border border-slate-200 bg-white p-2 text-amber-500 hover:bg-amber-50 dark:border-gray-800 dark:bg-gray-900">
            <Bell size={18} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500"></span>
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-[#0f0e0d] px-4 py-2 text-sm font-medium text-white transition hover:bg-black dark:bg-white dark:text-black"
          >
            <Plus size={16} /> Add Transaction
          </button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3 xl:grid-cols-4">
        <div className="col-span-full xl:col-span-2 relative overflow-hidden rounded-[24px] bg-[#1a1918] p-6 text-white shadow-lg">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl"></div>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Net Balance</p>
          <p className="mt-4 font-serif text-5xl font-bold tracking-tight">
            {money(netBalance)}
          </p>
          <div className="mt-8 flex items-end justify-between">
            <div className="w-full max-w-[60%]">
              <div className="h-1 w-full overflow-hidden rounded-full bg-gray-800">
                <div className="h-full rounded-full bg-amber-500" style={{ width: '72%' }}></div>
              </div>
            </div>
            <span className="text-xs font-semibold text-amber-500">History view</span>
          </div>
          <p className="mt-4 text-xs font-medium text-gray-400">Showing activity for {selectedDateLabel}</p>
        </div>

        <Card className="flex flex-col justify-between !bg-white">
          <div>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300">
              <span className="text-lg leading-none">↑</span>
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-widest text-gray-400">Income</p>
            <p className="mt-2 font-serif text-3xl font-bold">{money(totalIncome)}</p>
          </div>
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Selected day total</p>
        </Card>

        <Card className="flex flex-col justify-between !bg-white">
          <div>
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300">
              <span className="text-lg leading-none">↓</span>
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-widest text-gray-400">Expenses</p>
            <p className="mt-2 font-serif text-3xl font-bold">{money(totalSpent)}</p>
          </div>
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">Selected day total</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card className="!bg-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-lg font-bold">Spending overview</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{selectedDateLabel}</span>
            </div>
            <div className="h-64 flex justify-center">
              <div className="h-full w-full max-w-sm">
                {hasTransactions ? (
                  <Pie data={pieChartData} options={pieChartOptions} />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-gray-500 dark:border-gray-800">
                    No transactions for this day.
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="!bg-white">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4 dark:border-gray-800">
              <h2 className="font-serif text-lg font-bold">Recent transactions</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{selectedDateLabel}</span>
            </div>
            <div className="grid gap-0">
              <p className="mb-2 text-xs font-bold tracking-widest text-gray-400 uppercase">Selected day</p>
              {data.expenses.slice(0, 5).map((expense, i) => (
                <div key={expense.id || i} className="flex items-center justify-between border-b border-slate-50 py-3 last:border-0 dark:border-gray-800/50">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xl dark:bg-gray-800">
                      {expense.category === 'Food & Dining' ? '🍔' : expense.category === 'Transport' ? '🚗' : '💳'}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{expense.description || expense.item || expense.title || 'Transaction'}</p>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{expense.category} · {expense.date || selectedDateLabel}</p>
                    </div>
                  </div>
                  <span className={`font-bold ${expense.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                    {expense.type === 'income' ? '+' : '-'}{money(expense.amount)}
                  </span>
                </div>
              ))}
              {data.expenses.length === 0 && (
                <div className="py-4 text-center text-sm text-gray-500">
                  No transactions found for {selectedDateLabel}.
                </div>
              )}
            </div>
            <button className="mt-4 w-full text-center text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600 transition">
              View All Transactions →
            </button>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card className="!bg-white">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-lg font-bold">By category</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{selectedDateLabel}</span>
            </div>
            <div className="grid gap-5">
              {data.overview.category_breakdown?.slice(0, 5).map((cat, i) => (
                <ProgressBar key={cat.category} label={cat.category} value={cat.total} total={data.overview.total_month} color={['bg-amber-600', 'bg-red-500', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500'][i % 5]} format={money} />
              ))}
              {(!data.overview.category_breakdown || data.overview.category_breakdown.length === 0) && (
                <p className="text-sm text-gray-500">No categories found for this day.</p>
              )}
            </div>
          </Card>

          <Card className="!bg-white">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-lg font-bold">Budgets</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{selectedMonth}</span>
            </div>
            <div className="grid gap-5">
              {data.budgets.slice(0, 4).map((b, i) => (
                <ProgressBar key={b.category} label={b.category} value={b.spent} total={b.limit_amount} color={['bg-amber-500', 'bg-indigo-500', 'bg-purple-500', 'bg-emerald-500'][i % 4]} format={money} />
              ))}
              {data.budgets.length === 0 && (
                <p className="text-sm text-gray-500">No budgets set.</p>
              )}
            </div>
          </Card>

          <Card className="!bg-white">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-lg font-bold">Savings goals</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">Active</span>
            </div>
            <div className="grid gap-6 border-t border-slate-100 pt-4 dark:border-gray-800">
              {data.goals.slice(0, 3).map((goal) => (
                <div key={goal.id} className="flex items-center justify-between border-b border-slate-50 pb-4 last:border-0 last:pb-0 dark:border-gray-800/50">
                  <CircularProgress percentage={goal.progress} label={goal.title} subtext={`${money(goal.saved_amount)} of ${money(goal.target_amount)}`} />
                  <span className="font-serif text-lg font-bold">{money(goal.target_amount)}</span>
                </div>
              ))}
              {data.goals.length === 0 && (
                <p className="text-sm text-gray-500">No active savings goals.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <AddTransactionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onAdd={loadData} 
      />
    </div>
  );
}


import React, { useMemo, useState } from 'react';
import { Transaction, TransactionType } from '../types';
import { 
  ResponsiveContainer, 
  XAxis, YAxis, Tooltip,
  CartesianGrid,
  PieChart, Pie, Cell,
  AreaChart, Area
} from 'recharts';

interface Props {
  transactions: Transaction[];
}

const CATEGORY_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#ec4899', '#8b5cf6', '#06b6d4', '#94a3b8'];

const Dashboard: React.FC<Props> = ({ transactions }) => {
  const [selectedYear, setSelectedYear] = useState<string>(() => String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'ALL' | TransactionType.INBOUND | TransactionType.REPAIR>('ALL');

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    const currentYear = new Date().getFullYear();
    years.add(String(currentYear));
    transactions.forEach(t => {
      const y = t.date.split('-')[0];
      if (y && y.length === 4) years.add(y);
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const yearTransactions = useMemo(() => 
    transactions.filter(t => t.date.startsWith(selectedYear)),
  [transactions, selectedYear]);

  const filteredTransactions = useMemo(() => {
    return yearTransactions.filter(t => {
      const m = t.date.split('-')[1];
      const matchMonth = selectedMonth === 'all' || m === selectedMonth;
      const matchType = selectedTypeFilter === 'ALL' || t.type === selectedTypeFilter;
      return matchMonth && matchType;
    });
  }, [yearTransactions, selectedMonth, selectedTypeFilter]);

  // 結算統計數據：僅保留進貨與維修
  const settlementStats = useMemo(() => {
    const stats = {
      [TransactionType.INBOUND]: { total: 0, count: 0, icon: '📦', label: '進貨費用結算' },
      [TransactionType.REPAIR]: { total: 0, count: 0, icon: '🛠️', label: '維修費用結算' },
    };

    let grandTotal = 0;
    let grandCount = 0;

    filteredTransactions.forEach(t => {
      if (t.type === TransactionType.INBOUND) {
        stats[TransactionType.INBOUND].total += (t.total || 0);
        stats[TransactionType.INBOUND].count += 1;
        grandTotal += (t.total || 0);
        grandCount += 1;
      } else if (t.type === TransactionType.REPAIR) {
        stats[TransactionType.REPAIR].total += (t.total || 0);
        stats[TransactionType.REPAIR].count += 1;
        grandTotal += (t.total || 0);
        grandCount += 1;
      }
    });

    return { categories: stats, grandTotal, grandCount };
  }, [filteredTransactions]);

  // 維修排行榜數據
  const repairRanking = useMemo(() => {
    const map = new Map<string, { count: number, total: number }>();
    // 篩選出目前的維修紀錄
    filteredTransactions
      .filter(t => t.type === TransactionType.REPAIR)
      .forEach(t => {
        const current = map.get(t.materialName) || { count: 0, total: 0 };
        map.set(t.materialName, {
          count: current.count + 1,
          total: current.total + (t.total || 0)
        });
      });

    const list = Array.from(map.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.count - a.count || b.total - a.total);

    const maxCount = list.length > 0 ? list[0].count : 1;
    return list.slice(0, 10).map(item => ({
      ...item,
      percentage: (item.count / maxCount) * 100
    }));
  }, [filteredTransactions]);

  const annualTrendData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: `${i + 1}月`,
      amount: 0
    }));
    yearTransactions.forEach(t => {
      const isRelevantType = selectedTypeFilter === 'ALL' 
        ? (t.type === TransactionType.INBOUND || t.type === TransactionType.REPAIR)
        : t.type === selectedTypeFilter;

      if (isRelevantType) {
        const mIdx = parseInt(t.date.split('-')[1]) - 1;
        if (months[mIdx]) months[mIdx].amount += (t.total || 0);
      }
    });
    return months;
  }, [yearTransactions, selectedTypeFilter]);

  const machineCategoryData = useMemo(() => {
    const map = new Map<string, number>();
    filteredTransactions.forEach(t => {
      if (t.type === TransactionType.INBOUND || t.type === TransactionType.REPAIR) {
        const cat = t.machineCategory || '未分類';
        map.set(cat, (map.get(cat) || 0) + (t.total || 0));
      }
    });
    const totalValue = Array.from(map.values()).reduce((a, b) => a + b, 0);
    return Array.from(map.entries())
      .map(([name, value]) => ({ 
        name, 
        value,
        percent: totalValue > 0 ? (value / totalValue) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  const monthName = selectedMonth === 'all' ? '整年度' : `${selectedMonth} 月`;

  const cards = [
    { type: TransactionType.INBOUND, ...settlementStats.categories[TransactionType.INBOUND] },
    { type: TransactionType.REPAIR, ...settlementStats.categories[TransactionType.REPAIR] },
    { type: 'GRAND_TOTAL', total: settlementStats.grandTotal, icon: '💰', label: `${monthName} 結算總支出`, count: settlementStats.grandCount }
  ];

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      <div className="flex flex-wrap items-end justify-between px-2 gap-6">
        <div>
          <h3 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <span className="text-4xl">📊</span> 倉儲月結智慧中心
          </h3>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-[0.2em] mt-3">
            {selectedYear} {monthName} Warehouse Settlement
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2 shadow-sm flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">統計區間</span>
            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-transparent text-sm font-black text-indigo-600 outline-none cursor-pointer">
              {availableYears.map(year => <option key={year} value={year}>{year} 年</option>)}
            </select>
            <div className="w-px h-3 bg-slate-200"></div>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-transparent text-sm font-black text-indigo-600 outline-none cursor-pointer">
              <option value="all">整年度</option>
              {Array.from({ length: 12 }, (_, i) => {
                const m = String(i + 1).padStart(2, '0');
                return <option key={m} value={m}>{m} 月</option>;
              })}
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-1 shadow-sm flex items-center">
            {['ALL', TransactionType.INBOUND, TransactionType.REPAIR].map((type) => (
              <button 
                key={type}
                onClick={() => setSelectedTypeFilter(type as any)} 
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${selectedTypeFilter === type ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-indigo-600'}`}
              >
                {type === 'ALL' ? '全類別' : type}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => {
          const isGrand = card.type === 'GRAND_TOTAL';
          const isRepair = card.type === TransactionType.REPAIR;
          
          let colorClass = 'bg-white border-slate-200';
          let iconBg = 'bg-slate-50';
          let textClass = 'text-slate-900';
          
          if (isGrand) {
            colorClass = 'bg-slate-900 border-slate-800';
            iconBg = 'bg-indigo-600';
            textClass = 'text-white';
          } else if (isRepair) {
            iconBg = 'bg-emerald-50 text-emerald-600';
          } else {
            iconBg = 'bg-indigo-50 text-indigo-600';
          }

          return (
            <div key={card.type} className={`${colorClass} p-8 rounded-[2.5rem] border shadow-sm group hover:scale-[1.02] transition-all duration-300 relative overflow-hidden`}>
              {isGrand && <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>}
              <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center text-2xl mb-6 shadow-sm`}>{card.icon}</div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{card.label}</p>
              <div className="flex flex-col">
                <span className={`text-[12px] font-black ${isGrand ? 'text-indigo-400' : 'text-slate-400'} mb-1`}>NT$</span>
                <p className={`text-3xl font-black ${textClass} tabular-nums leading-none mb-4`}>{card.total.toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold ${isGrand ? 'text-indigo-400' : 'text-indigo-600'} bg-indigo-500/10 px-2 py-0.5 rounded-full`}>
                  {card.count} 筆紀錄
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div className="xl:col-span-8 space-y-8">
          {/* 月度結算走勢 */}
          <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 blur-3xl opacity-50"></div>
            <div className="flex items-center justify-between mb-10 relative z-10">
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-4">
                <span className="w-2 h-8 bg-indigo-600 rounded-full"></span>
                月度結算走勢趨勢
              </h3>
            </div>
            <div className="h-[350px] w-full">
              {annualTrendData.some(d => d.amount > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={annualTrendData} margin={{ top: 10, right: 10, left: 40, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 900, fill: '#94a3b8' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 800, fill: '#cbd5e1' }} tickFormatter={(val) => `NT$${(val/1000).toFixed(0)}k`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)', padding: '16px' }}
                      formatter={(value: number) => [`NT$ ${value.toLocaleString()}`, '結算額']}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#4f46e5" 
                      strokeWidth={5} 
                      fill="url(#colorAmt)" 
                      dot={(props: any) => {
                        const { cx, cy, index } = props;
                        const isSelected = selectedMonth !== 'all' && (index + 1) === parseInt(selectedMonth);
                        return isSelected ? <circle cx={cx} cy={cy} r={6} fill="#f43f5e" stroke="#fff" strokeWidth={3} /> : null;
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-100">
                  <span className="text-4xl mb-4">📭</span>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-300">本期間暫無數據</p>
                </div>
              )}
            </div>
          </div>

          {/* 維修料件損耗排行榜 */}
          <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden border border-white/5">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px] -mr-32 -mt-32"></div>
            <div className="relative z-10">
              <h3 className="text-xl font-black text-white flex items-center gap-4 mb-8">
                <span className="w-2 h-8 bg-emerald-500 rounded-full"></span>
                {monthName} 維修料件排行榜 (Top 10)
              </h3>
              
              <div className="space-y-5">
                {repairRanking.length > 0 ? repairRanking.map((item, idx) => (
                  <div key={idx} className="group">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-4">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${
                          idx === 0 ? 'bg-amber-400 text-amber-900 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : 
                          idx === 1 ? 'bg-slate-300 text-slate-700' : 
                          idx === 2 ? 'bg-amber-700 text-amber-50' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                        </span>
                        <span className="text-sm font-black text-slate-200 group-hover:text-emerald-400 transition-colors">{item.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-emerald-400">{item.count} 次維修</span>
                        <span className="mx-2 text-slate-700">|</span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">NT$ {item.total.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-1000 ease-out ${
                          idx === 0 ? 'bg-gradient-to-r from-emerald-500 to-indigo-500' : 'bg-slate-600'
                        }`} 
                        style={{ width: `${item.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                )) : (
                  <div className="py-20 text-center">
                    <p className="text-slate-600 font-black italic text-sm tracking-widest opacity-50 uppercase">本期間暫無維修紀錄排名</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="xl:col-span-4 bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm h-fit sticky top-8">
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-4 mb-8">
            <span className="w-2 h-8 bg-emerald-500 rounded-full"></span>
            機台費用佔比
          </h3>
          <div className="h-[300px] w-full">
            {machineCategoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={machineCategoryData} 
                    innerRadius="50%" 
                    outerRadius="80%" 
                    paddingAngle={5} 
                    dataKey="value"
                  >
                    {machineCategoryData.map((_, index) => <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} stroke="#fff" strokeWidth={4} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => `NT$ ${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-300 font-black italic text-sm opacity-30">此期間暫無數據</div>
            )}
          </div>
          <div className="mt-6 space-y-3 overflow-y-auto max-h-[120px] pr-2">
            {machineCategoryData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}></div>
                  <span className="text-xs font-black text-slate-600">{item.name}</span>
                </div>
                <span className="text-xs font-black text-slate-400">{item.percent.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
